// Provas anteriores: importação (texto + fonte oficial), pipeline de processamento, revisão humana,
// publicação no banco (atrás da flag de texto integral) e o Raio-X da banca que alimenta o planejador.
import { createHash } from "node:crypto";
import {
  computeBoardStats,
  incidenceForTopics,
  parseExamText,
  SMALL_SAMPLE_EXAMS,
  type BoardStatItem,
} from "@aprovaai/core";
import {
  aiInteractions,
  boards,
  exams,
  noticeSubjects,
  noticeTopics,
  pastExamQuestions,
  pastExams,
  questionOptions,
  questions,
  slugify,
  subjects,
  topics,
  type Database,
} from "@aprovaai/db";
import type { BoardXray, PastExamDetail, PastExamSummary } from "@aprovaai/shared";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import type { AiProvider } from "../../lib/ai/provider";
import { estimateCostUsd } from "../../lib/ai/anthropic";
import { AppError, conflict, notFound } from "../../lib/errors";
import { isFlagEnabled } from "../../lib/feature-flags";
import type { CurrentUser } from "../../plugins/auth-context";
import type { GoalRow } from "../plan/repository";

const CLASSIFY_CHUNK = 25;
const isEditor = (user: CurrentUser) => user.role === "editor" || user.role === "admin";

export class PastExamsService {
  constructor(
    private readonly db: Database,
    private readonly ai: AiProvider | null,
  ) {}

  // ---------- Importação ----------

  async create(
    user: CurrentUser,
    input: {
      boardName: string;
      organization: string;
      positionTitle: string;
      year: number;
      area?: string | undefined;
      sourceUrl: string;
      answerKeyUrl?: string | undefined;
      referenceNoticeId?: string | null | undefined;
      examText: string;
      answerKeyText: string;
    },
  ): Promise<{ id: string }> {
    const slug = slugify(input.boardName).slice(0, 50);
    const [board] = await this.db
      .insert(boards)
      .values({ name: input.boardName, slug })
      .onConflictDoUpdate({ target: boards.slug, set: { name: sql`${boards.name}` } })
      .returning({ id: boards.id });
    if (!board) throw new Error("Falha ao registrar a banca.");
    if (input.referenceNoticeId) {
      const [notice] = await this.db
        .select({ id: noticeSubjects.noticeId })
        .from(noticeSubjects)
        .where(eq(noticeSubjects.noticeId, input.referenceNoticeId))
        .limit(1);
      if (!notice)
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Edital de referência não encontrado ou sem disciplinas.",
        );
    }
    const contentHash = createHash("sha256").update(input.examText.replace(/\s+/g, " ").trim()).digest("hex");
    const [existing] = await this.db
      .select({ id: pastExams.id })
      .from(pastExams)
      .where(eq(pastExams.contentHash, contentHash));
    if (existing) throw conflict("Esta prova já foi importada.");

    const [created] = await this.db
      .insert(pastExams)
      .values({
        boardId: board.id,
        organization: input.organization,
        positionTitle: input.positionTitle,
        year: input.year,
        area: input.area ?? null,
        sourceUrl: input.sourceUrl,
        answerKeyUrl: input.answerKeyUrl ?? null,
        referenceNoticeId: input.referenceNoticeId ?? null,
        contentHash,
        examText: input.examText,
        answerKeyText: input.answerKeyText,
        uploadedBy: user.id,
      })
      .returning({ id: pastExams.id });
    if (!created) throw new Error("Falha ao registrar a prova.");
    return created;
  }

  // ---------- Pipeline (rodado pela fila) ----------

  /** Separa questões, aplica gabarito, classifica (IA, se ligada) e manda para revisão. Idempotente. */
  async process(pastExamId: string): Promise<void> {
    const [exam] = await this.db.select().from(pastExams).where(eq(pastExams.id, pastExamId));
    if (!exam) return;
    await this.db
      .update(pastExams)
      .set({ status: "processando", errorMessage: null })
      .where(eq(pastExams.id, exam.id));
    try {
      const parsed = parseExamText(exam.examText, exam.answerKeyText);
      if (parsed.questions.length === 0) throw new Error(parsed.warnings[0] ?? "Nenhuma questão encontrada.");

      await this.db.transaction(async (tx) => {
        await tx
          .delete(pastExamQuestions)
          .where(and(eq(pastExamQuestions.pastExamId, exam.id), isNull(pastExamQuestions.questionId)));
        await tx
          .insert(pastExamQuestions)
          .values(
            parsed.questions.map((q) => ({
              pastExamId: exam.id,
              number: q.number,
              type: q.type,
              statement: q.statement,
              options: q.options,
              correctAnswer: q.correctAnswer,
              annulled: q.annulled,
            })),
          )
          .onConflictDoNothing();
      });

      await this.classifyWithAi(exam.id, exam.referenceNoticeId, exam.uploadedBy);

      const [pending] = await this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(pastExamQuestions)
        .where(and(eq(pastExamQuestions.pastExamId, exam.id), eq(pastExamQuestions.needsReview, true)));
      await this.db
        .update(pastExams)
        .set({
          status: (pending?.value ?? 0) > 0 ? "em_revisao" : "processado",
          parseWarnings: parsed.warnings,
        })
        .where(eq(pastExams.id, exam.id));
    } catch (err) {
      await this.db
        .update(pastExams)
        .set({ status: "erro", errorMessage: err instanceof Error ? err.message : String(err) })
        .where(eq(pastExams.id, exam.id));
      throw err;
    }
  }

  private async referenceTaxonomy(noticeId: string | null) {
    if (!noticeId) return [];
    return this.db
      .select({
        subjectId: subjects.id,
        subjectName: subjects.name,
        topicId: topics.id,
        topicName: topics.name,
      })
      .from(noticeTopics)
      .innerJoin(noticeSubjects, eq(noticeSubjects.id, noticeTopics.noticeSubjectId))
      .innerJoin(subjects, eq(subjects.id, noticeSubjects.subjectId))
      .innerJoin(topics, eq(topics.id, noticeTopics.topicId))
      .where(eq(noticeSubjects.noticeId, noticeId))
      .orderBy(asc(noticeSubjects.sortOrder), asc(noticeTopics.sortOrder));
  }

  /** IA classifica em lotes; confiança baixa (ou sem assunto) fica para revisão humana. */
  private async classifyWithAi(pastExamId: string, noticeId: string | null, userId: string | null) {
    if (!this.ai || !noticeId || !(await isFlagEnabled(this.db, "ai"))) return;
    const taxonomy = await this.referenceTaxonomy(noticeId);
    if (taxonomy.length === 0) return;
    const items = await this.db
      .select()
      .from(pastExamQuestions)
      .where(
        and(
          eq(pastExamQuestions.pastExamId, pastExamId),
          isNull(pastExamQuestions.topicId),
          eq(pastExamQuestions.annulled, false),
        ),
      )
      .orderBy(asc(pastExamQuestions.number));

    for (let i = 0; i < items.length; i += CLASSIFY_CHUNK) {
      const chunk = items.slice(i, i + CLASSIFY_CHUNK);
      const result = await this.ai.classifyBatch(
        chunk.map((q) => ({
          number: q.number,
          type: q.type,
          statement: q.statement,
          options: q.options,
          correctAnswer: q.correctAnswer,
          board: null,
          subjectName: null,
          topicName: null,
        })),
        taxonomy.map((t) => ({ topicId: t.topicId, subjectName: t.subjectName, topicName: t.topicName })),
      );
      await this.db.insert(aiInteractions).values({
        userId,
        feature: "question_classify",
        model: result.usage?.model ?? "desconhecido",
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        costUsd: result.usage ? estimateCostUsd(result.usage) : null,
        status: result.ok ? "ok" : result.reason === "provider_error" ? "error" : result.reason,
        errorCode: result.ok ? null : result.reason,
      });
      if (!result.ok) return; // Sem IA, tudo segue para revisão humana.
      for (const c of result.data.items) {
        const item = chunk.find((q) => q.number === c.number);
        const match = taxonomy.find((t) => t.topicId === c.topicId);
        if (!item || !match) continue;
        await this.db
          .update(pastExamQuestions)
          .set({
            subjectId: match.subjectId,
            topicId: match.topicId,
            confidence: c.confidence,
            needsReview: c.confidence === "baixa",
          })
          .where(eq(pastExamQuestions.id, item.id));
      }
    }
  }

  // ---------- Leitura ----------

  private summaryQuery() {
    return this.db
      .select({
        exam: pastExams,
        board: boards.name,
        boardSlug: boards.slug,
        questionCount: sql<number>`(select count(*)::int from ${pastExamQuestions} q where q.past_exam_id = ${pastExams.id})`,
        pendingReview: sql<number>`(select count(*)::int from ${pastExamQuestions} q where q.past_exam_id = ${pastExams.id} and q.needs_review)`,
        published: sql<number>`(select count(*)::int from ${pastExamQuestions} q where q.past_exam_id = ${pastExams.id} and q.question_id is not null)`,
      })
      .from(pastExams)
      .innerJoin(boards, eq(boards.id, pastExams.boardId));
  }

  private toSummary(row: Awaited<ReturnType<PastExamsService["summaryQuery"]>>[number]): PastExamSummary {
    const e = row.exam;
    return {
      id: e.id,
      board: row.board,
      boardSlug: row.boardSlug,
      organization: e.organization,
      positionTitle: e.positionTitle,
      year: e.year,
      area: e.area,
      sourceUrl: e.sourceUrl,
      answerKeyUrl: e.answerKeyUrl,
      status: e.status,
      questionCount: row.questionCount,
      pendingReview: row.pendingReview,
      published: row.published,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async list(
    user: CurrentUser,
    filters: {
      board?: string | undefined;
      organization?: string | undefined;
      position?: string | undefined;
      year?: number | undefined;
      area?: string | undefined;
    },
  ): Promise<PastExamSummary[]> {
    const conditions: SQL[] = [];
    // Usuário comum só vê provas processadas; editor acompanha todas.
    if (!isEditor(user))
      conditions.push(
        ne(pastExams.status, "erro"),
        ne(pastExams.status, "pendente"),
        ne(pastExams.status, "processando"),
      );
    if (filters.board) conditions.push(eq(boards.slug, filters.board));
    if (filters.organization)
      conditions.push(ilike(pastExams.organization, `%${filters.organization.replace(/[\\%_]/g, "")}%`));
    if (filters.position)
      conditions.push(ilike(pastExams.positionTitle, `%${filters.position.replace(/[\\%_]/g, "")}%`));
    if (filters.area) conditions.push(ilike(pastExams.area, `%${filters.area.replace(/[\\%_]/g, "")}%`));
    if (filters.year) conditions.push(eq(pastExams.year, filters.year));
    const rows = await this.summaryQuery()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(pastExams.year), asc(boards.name));
    return rows.map((r) => this.toSummary(r));
  }

  async detail(user: CurrentUser, id: string): Promise<PastExamDetail> {
    const [row] = await this.summaryQuery().where(eq(pastExams.id, id));
    if (!row || (!isEditor(user) && ["pendente", "processando", "erro"].includes(row.exam.status))) {
      throw notFound("Prova não encontrada.");
    }
    const fullTextVisible = isEditor(user) || (await isFlagEnabled(this.db, "past_exam_full_text"));
    const items = await this.db
      .select({ item: pastExamQuestions, subjectName: subjects.name, topicName: topics.name })
      .from(pastExamQuestions)
      .leftJoin(subjects, eq(subjects.id, pastExamQuestions.subjectId))
      .leftJoin(topics, eq(topics.id, pastExamQuestions.topicId))
      .where(eq(pastExamQuestions.pastExamId, id))
      .orderBy(asc(pastExamQuestions.number));
    return {
      ...this.toSummary(row),
      parseWarnings: row.exam.parseWarnings,
      errorMessage: isEditor(user) ? row.exam.errorMessage : null,
      referenceNoticeId: row.exam.referenceNoticeId,
      fullTextVisible,
      taxonomy: isEditor(user) ? await this.referenceTaxonomy(row.exam.referenceNoticeId) : [],
      items: items.map(({ item, subjectName, topicName }) => ({
        id: item.id,
        number: item.number,
        type: item.type,
        statement: fullTextVisible ? item.statement : null,
        options: fullTextVisible ? item.options : [],
        correctAnswer: item.correctAnswer,
        annulled: item.annulled,
        subjectId: item.subjectId,
        topicId: item.topicId,
        subjectName,
        topicName,
        confidence: item.confidence,
        needsReview: item.needsReview,
        published: item.questionId !== null,
      })),
    };
  }

  // ---------- Revisão humana e publicação ----------

  async reviewItem(
    user: CurrentUser,
    pastExamId: string,
    itemId: string,
    input: { subjectId: string | null; topicId: string | null; annulled?: boolean | undefined },
  ): Promise<void> {
    const [item] = await this.db
      .select({ id: pastExamQuestions.id, referenceNoticeId: pastExams.referenceNoticeId })
      .from(pastExamQuestions)
      .innerJoin(pastExams, eq(pastExams.id, pastExamQuestions.pastExamId))
      .where(and(eq(pastExamQuestions.id, itemId), eq(pastExamQuestions.pastExamId, pastExamId)));
    if (!item) throw notFound("Questão da prova não encontrada.");
    if (input.topicId) {
      const taxonomy = await this.referenceTaxonomy(item.referenceNoticeId);
      const match = taxonomy.find((t) => t.topicId === input.topicId);
      const [topic] = match
        ? [match]
        : await this.db
            .select({ subjectId: topics.subjectId, topicId: topics.id })
            .from(topics)
            .where(and(eq(topics.id, input.topicId), isNull(topics.ownerUserId)));
      if (!topic || (input.subjectId && topic.subjectId !== input.subjectId))
        throw new AppError(400, "VALIDATION_ERROR", "Assunto inválido.");
      input.subjectId = topic.subjectId;
    }
    await this.db
      .update(pastExamQuestions)
      .set({
        subjectId: input.subjectId,
        topicId: input.topicId,
        needsReview: false,
        reviewedBy: user.id,
        ...(input.annulled !== undefined ? { annulled: input.annulled } : {}),
      })
      .where(eq(pastExamQuestions.id, item.id));
  }

  async finishReview(pastExamId: string): Promise<void> {
    const [exam] = await this.db.select().from(pastExams).where(eq(pastExams.id, pastExamId));
    if (!exam) throw notFound("Prova não encontrada.");
    const [pending] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(pastExamQuestions)
      .where(and(eq(pastExamQuestions.pastExamId, exam.id), eq(pastExamQuestions.needsReview, true)));
    if ((pending?.value ?? 0) > 0)
      throw conflict(`Ainda há ${pending?.value} questão(ões) aguardando revisão.`);
    await this.db.update(pastExams).set({ status: "processado" }).where(eq(pastExams.id, exam.id));
  }

  /** Publica itens revisados no banco de questões (catálogo), com crédito e link para a fonte oficial. */
  async publish(pastExamId: string): Promise<{ published: number }> {
    if (!(await isFlagEnabled(this.db, "past_exam_full_text"))) {
      throw new AppError(
        409,
        "CONFLICT",
        "Publicação de texto integral desativada (flag past_exam_full_text) até a avaliação jurídica.",
      );
    }
    const [row] = await this.summaryQuery().where(eq(pastExams.id, pastExamId));
    if (!row) throw notFound("Prova não encontrada.");
    if (row.exam.status !== "processado") throw conflict("Conclua a revisão antes de publicar.");
    const items = await this.db
      .select()
      .from(pastExamQuestions)
      .where(
        and(
          eq(pastExamQuestions.pastExamId, pastExamId),
          isNull(pastExamQuestions.questionId),
          eq(pastExamQuestions.annulled, false),
          eq(pastExamQuestions.needsReview, false),
        ),
      );
    let published = 0;
    for (const item of items.filter((i) => i.correctAnswer)) {
      await this.db.transaction(async (tx) => {
        const [question] = await tx
          .insert(questions)
          .values({
            type: item.type,
            statement: item.statement,
            boardId: row.exam.boardId,
            organization: `${row.exam.organization} — ${row.exam.positionTitle} (${row.board}, ${row.exam.year})`,
            year: row.exam.year,
            subjectId: item.subjectId,
            topicId: item.topicId,
            correctAnswer: item.correctAnswer,
            sourceUrl: row.exam.sourceUrl,
            usagePermission: `Prova oficial ${row.board} ${row.exam.year}; texto exibido com crédito e link para a fonte.`,
            contentStatus: "validado",
            contentOrigin: "oficial",
          })
          .returning({ id: questions.id });
        if (!question) return;
        if (item.options.length) {
          await tx.insert(questionOptions).values(
            item.options.map((o, i) => ({
              questionId: question.id,
              label: o.label,
              text: o.text,
              sortOrder: i,
            })),
          );
        }
        await tx
          .update(pastExamQuestions)
          .set({ questionId: question.id })
          .where(eq(pastExamQuestions.id, item.id));
        published++;
      });
    }
    return { published };
  }

  // ---------- Raio-X ----------

  /** Itens revisados (needs_review = false) da banca, opcionalmente filtrados por órgão/área. */
  private async statItems(
    boardId: string,
    filters: { organization?: string | null; area?: string | null } = {},
  ) {
    const conditions: SQL[] = [
      eq(pastExams.boardId, boardId),
      eq(pastExamQuestions.needsReview, false),
      ne(pastExams.status, "erro"),
    ];
    if (filters.organization)
      conditions.push(ilike(pastExams.organization, `%${filters.organization.replace(/[\\%_]/g, "")}%`));
    if (filters.area) conditions.push(ilike(pastExams.area, `%${filters.area.replace(/[\\%_]/g, "")}%`));
    return this.db
      .select({
        examId: pastExams.id,
        year: pastExams.year,
        topicId: pastExamQuestions.topicId,
        annulled: pastExamQuestions.annulled,
        type: pastExamQuestions.type,
        statementLength: sql<number>`length(${pastExamQuestions.statement})`,
      })
      .from(pastExamQuestions)
      .innerJoin(pastExams, eq(pastExams.id, pastExamQuestions.pastExamId))
      .where(and(...conditions));
  }

  async boardsWithData() {
    return this.db
      .select({
        slug: boards.slug,
        name: boards.name,
        exams: sql<number>`count(distinct ${pastExams.id})::int`,
      })
      .from(pastExams)
      .innerJoin(boards, eq(boards.id, pastExams.boardId))
      .where(ne(pastExams.status, "erro"))
      .groupBy(boards.slug, boards.name)
      .orderBy(asc(boards.name));
  }

  async xray(
    boardSlug: string,
    filters: { organization?: string | null; area?: string | null },
  ): Promise<BoardXray> {
    const [board] = await this.db.select().from(boards).where(eq(boards.slug, boardSlug));
    if (!board) throw notFound("Banca não encontrada.");
    const items = await this.statItems(board.id, filters);
    const stats = computeBoardStats(
      items.map(({ examId, year, topicId, annulled }): BoardStatItem => ({
        examId,
        year,
        topicId,
        annulled,
      })),
    );
    const topicRows = stats.topics.length
      ? await this.db
          .select({ id: topics.id, name: topics.name, subjectName: subjects.name })
          .from(topics)
          .innerJoin(subjects, eq(subjects.id, topics.subjectId))
          .where(
            inArray(
              topics.id,
              stats.topics.map((t) => t.topicId),
            ),
          )
      : [];
    const names = new Map(topicRows.map((t) => [t.id, t]));
    const valid = items.filter((i) => !i.annulled);
    return {
      board: { slug: board.slug, name: board.name },
      filters: { organization: filters.organization ?? null, area: filters.area ?? null },
      sample: {
        exams: stats.exams,
        questions: stats.totalQuestions,
        yearFrom: stats.yearFrom,
        yearTo: stats.yearTo,
        small: stats.exams < SMALL_SAMPLE_EXAMS,
      },
      topics: stats.topics.map((t) => ({
        ...t,
        topicName: names.get(t.topicId)?.name ?? "Assunto removido",
        subjectName: names.get(t.topicId)?.subjectName ?? "—",
      })),
      // Estilo calculado dos próprios itens (estimativa estrutural, não análise de conteúdo).
      style: {
        certoErradoShare: valid.length
          ? Math.round((valid.filter((i) => i.type === "certo_errado").length / valid.length) * 1000) / 10
          : null,
        averageStatementChars: valid.length
          ? Math.round(valid.reduce((s, i) => s + i.statementLength, 0) / valid.length)
          : null,
        annulledShare: items.length
          ? Math.round((items.filter((i) => i.annulled).length / items.length) * 1000) / 10
          : null,
      },
    };
  }

  async boardSlugForExam(examId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ slug: boards.slug })
      .from(exams)
      .innerJoin(boards, eq(boards.id, exams.boardId))
      .where(eq(exams.id, examId));
    return row?.slug ?? null;
  }

  /** Incidência na banca (0–1) por assunto do edital do plano. Vazio sem banca ou com amostra pequena. */
  async incidenceForGoal(goal: GoalRow, noticeTopicIds: string[]): Promise<Map<string, number>> {
    const [exam] = await this.db
      .select({ boardId: exams.boardId })
      .from(exams)
      .where(eq(exams.id, goal.examId));
    if (!exam?.boardId || noticeTopicIds.length === 0) return new Map();
    const mapping = await this.db
      .select({ noticeTopicId: noticeTopics.id, topicId: noticeTopics.topicId })
      .from(noticeTopics)
      .where(inArray(noticeTopics.id, noticeTopicIds));
    const items = await this.statItems(exam.boardId);
    const stats = computeBoardStats(
      items.map(({ examId, year, topicId, annulled }) => ({ examId, year, topicId, annulled })),
    );
    const byTopic = incidenceForTopics(stats, [...new Set(mapping.map((m) => m.topicId))]);
    const result = new Map<string, number>();
    for (const m of mapping) {
      const value = byTopic.get(m.topicId);
      if (value !== undefined) result.set(m.noticeTopicId, value);
    }
    return result;
  }
}
