// Questões, tentativas, caderno de erros e revisão espaçada.
// Dado privado (tentativas, notas, listas, revisões, questões pessoais) sempre filtrado por userId.
import { nextReviewState, reviewBucket, todayIn, type ReviewState } from "@aprovaai/core";
import {
  boards,
  questionAttempts,
  questionListItems,
  questionLists,
  questionNotes,
  questionOptions,
  questionReports,
  questions,
  reviewItems,
  slugify,
  subjects,
  topics,
  userExamGoals,
  type Database,
} from "@aprovaai/db";
import type {
  AttemptDto,
  ErrorNotebookEntry,
  ErrorTypeValue,
  QuestionDetail,
  QuestionSummary,
  ReviewItemDto,
} from "@aprovaai/shared";
import { and, asc, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { AppError, conflict, notFound } from "../../lib/errors";
import type { CurrentUser } from "../../plugins/auth-context";

type Filters = {
  subjectId?: string | undefined;
  topicId?: string | undefined;
  board?: string | undefined;
  year?: number | undefined;
  status: "todas" | "nao_respondidas" | "erradas" | "favoritas";
  scope: "todas" | "catalogo" | "minhas";
  listId?: string | undefined;
  page: number;
  pageSize: number;
};

const PREVIEW_LENGTH = 160;
const preview = (text: string | null) =>
  text ? (text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text) : null;

const isEditor = (user: CurrentUser) => user.role === "editor" || user.role === "admin";

/** Catálogo validado para todos (rascunhos só para editor) + questões pessoais do próprio usuário. */
function questionVisibility(user: CurrentUser): SQL {
  const catalog = isEditor(user)
    ? isNull(questions.ownerUserId)
    : and(isNull(questions.ownerUserId), eq(questions.contentStatus, "validado"));
  return or(catalog, eq(questions.ownerUserId, user.id)) as SQL;
}

const attemptsCount = (userId: string) =>
  sql<number>`(select count(*)::int from ${questionAttempts} qa where qa.question_id = ${questions.id} and qa.user_id = ${userId})`;
const lastCorrect = (userId: string) =>
  sql<
    boolean | null
  >`(select qa.is_correct from ${questionAttempts} qa where qa.question_id = ${questions.id} and qa.user_id = ${userId} order by qa.answered_at desc limit 1)`;
const isFavorite = (userId: string) =>
  sql<boolean>`exists(select 1 from ${questionListItems} li join ${questionLists} l on l.id = li.list_id where li.question_id = ${questions.id} and l.user_id = ${userId} and l.is_favorites)`;

function toAttemptDto(a: typeof questionAttempts.$inferSelect): AttemptDto {
  return {
    id: a.id,
    answer: a.answer,
    isCorrect: a.isCorrect,
    errorType: a.errorType,
    timeSpentSec: a.timeSpentSec,
    context: a.context,
    answeredAt: a.answeredAt.toISOString(),
  };
}

function reviewDto(r: { stage: number; dueDate: string; status: "ativa" | "dominada" } | null | undefined) {
  return r ? { stage: r.stage, dueDate: r.dueDate, status: r.status } : null;
}

export class QuestionsService {
  constructor(private readonly db: Database) {}

  private today(user: CurrentUser) {
    return todayIn(user.timezone);
  }

  private async reviewIntervals(userId: string): Promise<number[]> {
    const [goal] = await this.db
      .select({ reviewIntervals: userExamGoals.reviewIntervals })
      .from(userExamGoals)
      .where(and(eq(userExamGoals.userId, userId), eq(userExamGoals.isActive, true)));
    return goal?.reviewIntervals ?? [1, 7, 30];
  }

  private async findVisible(user: CurrentUser, questionId: string) {
    const [row] = await this.db
      .select()
      .from(questions)
      .where(and(eq(questions.id, questionId), questionVisibility(user)));
    return row ?? null;
  }

  private async findOrCreateBoard(name: string | undefined): Promise<string | null> {
    if (!name) return null;
    const slug = slugify(name).slice(0, 50);
    if (!slug) return null;
    const [board] = await this.db
      .insert(boards)
      .values({ name, slug })
      .onConflictDoUpdate({ target: boards.slug, set: { name: sql`${boards.name}` } })
      .returning({ id: boards.id });
    return board?.id ?? null;
  }

  // ---------- Banco de questões ----------

  async list(user: CurrentUser, filters: Filters): Promise<{ items: QuestionSummary[]; total: number }> {
    const conditions: SQL[] = [questionVisibility(user)];
    if (filters.scope === "catalogo") conditions.push(isNull(questions.ownerUserId));
    if (filters.scope === "minhas") conditions.push(eq(questions.ownerUserId, user.id));
    if (filters.subjectId) conditions.push(eq(questions.subjectId, filters.subjectId));
    if (filters.topicId) conditions.push(eq(questions.topicId, filters.topicId));
    if (filters.board) conditions.push(eq(boards.slug, filters.board));
    if (filters.year) conditions.push(eq(questions.year, filters.year));
    if (filters.status === "nao_respondidas") conditions.push(sql`${attemptsCount(user.id)} = 0`);
    if (filters.status === "erradas") conditions.push(sql`${lastCorrect(user.id)} = false`);
    if (filters.status === "favoritas") conditions.push(sql`${isFavorite(user.id)}`);
    if (filters.listId) {
      conditions.push(
        sql`exists(select 1 from ${questionListItems} li join ${questionLists} l on l.id = li.list_id where li.question_id = ${questions.id} and l.id = ${filters.listId} and l.user_id = ${user.id})`,
      );
    }
    const where = and(...conditions);

    const rows = await this.db
      .select({
        id: questions.id,
        type: questions.type,
        statement: questions.statement,
        externalSource: questions.externalSource,
        board: boards.name,
        organization: questions.organization,
        year: questions.year,
        subjectName: subjects.name,
        topicName: topics.name,
        ownerUserId: questions.ownerUserId,
        isSample: questions.isSample,
        attempts: attemptsCount(user.id),
        lastCorrect: lastCorrect(user.id),
        isFavorite: isFavorite(user.id),
      })
      .from(questions)
      .leftJoin(boards, eq(boards.id, questions.boardId))
      .leftJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .where(where)
      .orderBy(desc(questions.createdAt), asc(questions.id))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize);
    const [total] = await this.db
      .select({ value: count() })
      .from(questions)
      .leftJoin(boards, eq(boards.id, questions.boardId))
      .where(where);

    return {
      total: total?.value ?? 0,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        statementPreview:
          preview(r.statement) ?? (r.externalSource ? `Registrada de: ${r.externalSource}` : null),
        board: r.board,
        organization: r.organization,
        year: r.year,
        subjectName: r.subjectName,
        topicName: r.topicName,
        isPrivate: r.ownerUserId !== null,
        isSample: r.isSample,
        attempts: r.attempts,
        lastCorrect: r.lastCorrect,
        isFavorite: r.isFavorite,
      })),
    };
  }

  /** Próxima questão do filtro (não respondidas primeiro), excluindo a atual. */
  async next(user: CurrentUser, filters: Filters, excludeId?: string): Promise<string | null> {
    const { items } = await this.list(user, { ...filters, page: 1, pageSize: 50 });
    const candidates = items.filter(
      (q) => q.id !== excludeId && q.statementPreview && !q.statementPreview.startsWith("Registrada de:"),
    );
    const unanswered = candidates.find((q) => q.attempts === 0);
    return (unanswered ?? candidates[0])?.id ?? null;
  }

  async detail(user: CurrentUser, questionId: string): Promise<QuestionDetail> {
    const q = await this.findVisible(user, questionId);
    if (!q) throw notFound("Questão não encontrada.");
    const [meta] = await this.db
      .select({ board: boards.name, subjectName: subjects.name, topicName: topics.name })
      .from(questions)
      .leftJoin(boards, eq(boards.id, questions.boardId))
      .leftJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .where(eq(questions.id, q.id));
    const [options, history, [note], [review], [favorite]] = await Promise.all([
      this.db
        .select({ label: questionOptions.label, text: questionOptions.text })
        .from(questionOptions)
        .where(eq(questionOptions.questionId, q.id))
        .orderBy(asc(questionOptions.sortOrder)),
      this.db
        .select()
        .from(questionAttempts)
        .where(and(eq(questionAttempts.questionId, q.id), eq(questionAttempts.userId, user.id)))
        .orderBy(desc(questionAttempts.answeredAt))
        .limit(20),
      this.db
        .select({ body: questionNotes.body })
        .from(questionNotes)
        .where(and(eq(questionNotes.questionId, q.id), eq(questionNotes.userId, user.id))),
      this.db
        .select()
        .from(reviewItems)
        .where(and(eq(reviewItems.questionId, q.id), eq(reviewItems.userId, user.id))),
      this.db
        .select({ value: isFavorite(user.id) })
        .from(questions)
        .where(eq(questions.id, q.id)),
    ]);

    const revealed = history.length > 0;
    const opts =
      q.type === "certo_errado"
        ? [
            { label: "C", text: "Certo" },
            { label: "E", text: "Errado" },
          ]
        : options;
    return {
      id: q.id,
      type: q.type,
      statementPreview: preview(q.statement),
      statement: q.statement,
      options: opts,
      board: meta?.board ?? null,
      organization: q.organization,
      year: q.year,
      subjectName: meta?.subjectName ?? null,
      topicName: meta?.topicName ?? null,
      difficulty: q.difficulty,
      sourceUrl: q.sourceUrl,
      externalSource: q.externalSource,
      annulled: q.annulled,
      isPrivate: q.ownerUserId !== null,
      isSample: q.isSample,
      attempts: history.length,
      lastCorrect: history[0]?.isCorrect ?? null,
      isFavorite: favorite?.value ?? false,
      correctAnswer: revealed ? q.correctAnswer : null,
      explanation: revealed ? q.explanation : null,
      explanationOrigin: revealed ? q.explanationOrigin : null,
      revealed,
      note: note?.body ?? null,
      history: history.map(toAttemptDto),
      review: reviewDto(review),
    };
  }

  // ---------- Tentativas ----------

  /** Atualiza a fila de revisão espaçada a partir do resultado de uma tentativa. */
  private async updateReview(user: CurrentUser, questionId: string, correct: boolean) {
    const today = this.today(user);
    const [current] = await this.db
      .select()
      .from(reviewItems)
      .where(and(eq(reviewItems.userId, user.id), eq(reviewItems.questionId, questionId)));
    const currentState: ReviewState | null = current
      ? { stage: current.stage, dueDate: current.dueDate, status: current.status }
      : null;
    const next = nextReviewState(currentState, correct, today, await this.reviewIntervals(user.id));
    if (!next) return null;
    const [saved] = await this.db
      .insert(reviewItems)
      .values({
        userId: user.id,
        questionId,
        stage: next.stage,
        dueDate: next.dueDate,
        status: next.status,
        lastResult: correct,
      })
      .onConflictDoUpdate({
        target: [reviewItems.userId, reviewItems.questionId],
        set: { stage: next.stage, dueDate: next.dueDate, status: next.status, lastResult: correct },
      })
      .returning();
    return reviewDto(saved);
  }

  async attempt(
    user: CurrentUser,
    questionId: string,
    input: {
      answer: string;
      timeSpentSec?: number | undefined;
      context: "avulsa" | "revisao";
      idempotencyKey: string;
    },
  ) {
    const q = await this.findVisible(user, questionId);
    if (!q) throw notFound("Questão não encontrada.");
    if (q.annulled) throw conflict("Questão anulada: não conta para o desempenho.");
    if (!q.correctAnswer) throw conflict("Esta questão não tem gabarito cadastrado.");

    const isCorrect = input.answer === q.correctAnswer;
    const [inserted] = await this.db
      .insert(questionAttempts)
      .values({
        userId: user.id,
        questionId: q.id,
        answer: input.answer,
        isCorrect,
        timeSpentSec: input.timeSpentSec,
        context: input.context,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: [questionAttempts.userId, questionAttempts.idempotencyKey] })
      .returning();

    // Reenvio com a mesma chave: devolve a tentativa original, sem mexer na revisão de novo.
    const attempt =
      inserted ??
      (
        await this.db
          .select()
          .from(questionAttempts)
          .where(
            and(
              eq(questionAttempts.userId, user.id),
              eq(questionAttempts.idempotencyKey, input.idempotencyKey),
            ),
          )
      )[0];
    if (!attempt || attempt.questionId !== q.id)
      throw conflict("Chave de idempotência já usada em outra questão.");

    const review = inserted
      ? await this.updateReview(user, q.id, isCorrect)
      : reviewDto(
          (
            await this.db
              .select()
              .from(reviewItems)
              .where(and(eq(reviewItems.userId, user.id), eq(reviewItems.questionId, q.id)))
          )[0],
        );
    return {
      attempt: toAttemptDto(attempt),
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      review,
    };
  }

  async classify(user: CurrentUser, attemptId: string, errorType: ErrorTypeValue): Promise<AttemptDto> {
    const [attempt] = await this.db
      .select()
      .from(questionAttempts)
      .where(and(eq(questionAttempts.id, attemptId), eq(questionAttempts.userId, user.id)));
    if (!attempt) throw notFound("Tentativa não encontrada.");
    if (attempt.isCorrect) throw conflict("Só tentativas erradas recebem classificação de erro.");
    const [updated] = await this.db
      .update(questionAttempts)
      .set({ errorType })
      .where(and(eq(questionAttempts.id, attempt.id), eq(questionAttempts.userId, user.id)))
      .returning();
    if (!updated) throw notFound();
    return toAttemptDto(updated);
  }

  // ---------- Questões pessoais ----------

  async createPersonal(
    user: CurrentUser,
    input: {
      type: "multipla_escolha" | "certo_errado";
      subjectId?: string | null | undefined;
      topicId?: string | null | undefined;
      board?: string | undefined;
      organization?: string | undefined;
      year?: number | undefined;
      statement: string;
      options: { label: string; text: string }[];
      correctAnswer: string;
      explanation?: string | undefined;
      sourceUrl?: string | undefined;
    },
  ): Promise<{ id: string }> {
    await this.assertTaxonomy(user, input.subjectId, input.topicId);
    const boardId = await this.findOrCreateBoard(input.board);
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(questions)
        .values({
          ownerUserId: user.id,
          type: input.type,
          statement: input.statement,
          boardId,
          organization: input.organization,
          year: input.year,
          subjectId: input.subjectId ?? null,
          topicId: input.topicId ?? null,
          correctAnswer: input.correctAnswer,
          explanation: input.explanation,
          explanationOrigin: input.explanation ? "autoral" : null,
          sourceUrl: input.sourceUrl,
          contentStatus: "validado",
          contentOrigin: "usuario",
        })
        .returning({ id: questions.id });
      if (!created) throw new Error("Falha ao criar questão.");
      if (input.type === "multipla_escolha" && input.options.length > 0) {
        await tx
          .insert(questionOptions)
          .values(
            input.options.map((o, i) => ({
              questionId: created.id,
              label: o.label,
              text: o.text,
              sortOrder: i,
            })),
          );
      }
      return created;
    });
  }

  async quickRegister(
    user: CurrentUser,
    input: {
      type: "multipla_escolha" | "certo_errado";
      subjectId?: string | null | undefined;
      topicId?: string | null | undefined;
      board?: string | undefined;
      organization?: string | undefined;
      year?: number | undefined;
      externalSource?: string | undefined;
      reference?: string | undefined;
      myAnswer?: string | undefined;
      isCorrect: boolean;
      errorType?: ErrorTypeValue | null | undefined;
      timeSpentSec?: number | undefined;
    },
  ) {
    await this.assertTaxonomy(user, input.subjectId, input.topicId);
    const boardId = await this.findOrCreateBoard(input.board);
    const source = [input.externalSource, input.reference].filter(Boolean).join(" — ") || "outra plataforma";
    const [question] = await this.db
      .insert(questions)
      .values({
        ownerUserId: user.id,
        type: input.type,
        statement: null,
        boardId,
        organization: input.organization,
        year: input.year,
        subjectId: input.subjectId ?? null,
        topicId: input.topicId ?? null,
        externalSource: source,
        contentStatus: "validado",
        contentOrigin: "usuario",
      })
      .returning({ id: questions.id });
    if (!question) throw new Error("Falha ao registrar questão.");
    const [attempt] = await this.db
      .insert(questionAttempts)
      .values({
        userId: user.id,
        questionId: question.id,
        answer: input.myAnswer ?? null,
        isCorrect: input.isCorrect,
        errorType: input.isCorrect ? null : (input.errorType ?? null),
        timeSpentSec: input.timeSpentSec,
        context: "registro_externo",
        idempotencyKey: `quick-${question.id}`,
      })
      .returning();
    if (!attempt) throw new Error("Falha ao registrar tentativa.");
    const review = await this.updateReview(user, question.id, input.isCorrect);
    return { questionId: question.id, attempt: toAttemptDto(attempt), review };
  }

  /** Disciplina/assunto precisam existir e ser do catálogo ou do próprio usuário. */
  private async assertTaxonomy(user: CurrentUser, subjectId?: string | null, topicId?: string | null) {
    if (subjectId) {
      const [s] = await this.db
        .select({ id: subjects.id })
        .from(subjects)
        .where(
          and(
            eq(subjects.id, subjectId),
            or(isNull(subjects.ownerUserId), eq(subjects.ownerUserId, user.id)),
          ),
        );
      if (!s) throw new AppError(400, "VALIDATION_ERROR", "Disciplina inválida.");
    }
    if (topicId) {
      const [t] = await this.db
        .select({ id: topics.id, subjectId: topics.subjectId })
        .from(topics)
        .where(and(eq(topics.id, topicId), or(isNull(topics.ownerUserId), eq(topics.ownerUserId, user.id))));
      if (!t || (subjectId && t.subjectId !== subjectId))
        throw new AppError(400, "VALIDATION_ERROR", "Assunto inválido.");
    }
  }

  // ---------- Anotações, favoritos, listas, reportes ----------

  async saveNote(user: CurrentUser, questionId: string, body: string): Promise<{ note: string | null }> {
    if (!(await this.findVisible(user, questionId))) throw notFound("Questão não encontrada.");
    if (!body) {
      await this.db
        .delete(questionNotes)
        .where(and(eq(questionNotes.userId, user.id), eq(questionNotes.questionId, questionId)));
      return { note: null };
    }
    await this.db
      .insert(questionNotes)
      .values({ userId: user.id, questionId, body })
      .onConflictDoUpdate({ target: [questionNotes.userId, questionNotes.questionId], set: { body } });
    return { note: body };
  }

  private async favoritesListId(userId: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: questionLists.id })
      .from(questionLists)
      .where(and(eq(questionLists.userId, userId), eq(questionLists.isFavorites, true)));
    if (existing) return existing.id;
    const [created] = await this.db
      .insert(questionLists)
      .values({ userId, name: "Favoritas", isFavorites: true })
      .onConflictDoNothing()
      .returning({ id: questionLists.id });
    if (created) return created.id;
    return this.favoritesListId(userId);
  }

  async toggleFavorite(user: CurrentUser, questionId: string): Promise<{ isFavorite: boolean }> {
    if (!(await this.findVisible(user, questionId))) throw notFound("Questão não encontrada.");
    const listId = await this.favoritesListId(user.id);
    const removed = await this.db
      .delete(questionListItems)
      .where(and(eq(questionListItems.listId, listId), eq(questionListItems.questionId, questionId)))
      .returning();
    if (removed.length > 0) return { isFavorite: false };
    await this.db.insert(questionListItems).values({ listId, questionId }).onConflictDoNothing();
    return { isFavorite: true };
  }

  async lists(user: CurrentUser) {
    return this.db
      .select({
        id: questionLists.id,
        name: questionLists.name,
        isFavorites: questionLists.isFavorites,
        count: sql<number>`(select count(*)::int from ${questionListItems} li where li.list_id = ${questionLists.id})`,
      })
      .from(questionLists)
      .where(eq(questionLists.userId, user.id))
      .orderBy(desc(questionLists.isFavorites), asc(questionLists.name));
  }

  async createList(user: CurrentUser, name: string) {
    const [created] = await this.db.insert(questionLists).values({ userId: user.id, name }).returning();
    if (!created) throw new Error("Falha ao criar lista.");
    return { id: created.id, name: created.name, isFavorites: false, count: 0 };
  }

  private async ownList(user: CurrentUser, listId: string) {
    const [list] = await this.db
      .select()
      .from(questionLists)
      .where(and(eq(questionLists.id, listId), eq(questionLists.userId, user.id)));
    if (!list) throw notFound("Lista não encontrada.");
    return list;
  }

  async addToList(user: CurrentUser, listId: string, questionId: string) {
    await this.ownList(user, listId);
    if (!(await this.findVisible(user, questionId))) throw notFound("Questão não encontrada.");
    await this.db.insert(questionListItems).values({ listId, questionId }).onConflictDoNothing();
  }

  async removeFromList(user: CurrentUser, listId: string, questionId: string) {
    await this.ownList(user, listId);
    await this.db
      .delete(questionListItems)
      .where(and(eq(questionListItems.listId, listId), eq(questionListItems.questionId, questionId)));
  }

  async deleteList(user: CurrentUser, listId: string) {
    const list = await this.ownList(user, listId);
    if (list.isFavorites) throw conflict("A lista de favoritas não pode ser excluída.");
    await this.db
      .delete(questionLists)
      .where(and(eq(questionLists.id, list.id), eq(questionLists.userId, user.id)));
  }

  async report(user: CurrentUser, questionId: string, reason: string) {
    const q = await this.findVisible(user, questionId);
    if (!q) throw notFound("Questão não encontrada.");
    if (q.ownerUserId !== null)
      throw conflict("Reporte é só para questões do catálogo; edite a sua questão diretamente.");
    const [created] = await this.db
      .insert(questionReports)
      .values({ userId: user.id, questionId, reason })
      .returning({ id: questionReports.id });
    return { id: created?.id ?? "" };
  }

  // ---------- Revisões e caderno de erros ----------

  private lastErrorType(userId: string) {
    return sql<ErrorTypeValue | null>`(select qa.error_type from ${questionAttempts} qa where qa.question_id = ${questions.id} and qa.user_id = ${userId} and qa.is_correct = false order by qa.answered_at desc limit 1)`;
  }

  async reviews(user: CurrentUser, bucket?: ReviewItemDto["bucket"]) {
    const today = this.today(user);
    const rows = await this.db
      .select({
        item: reviewItems,
        statement: questions.statement,
        externalSource: questions.externalSource,
        subjectName: subjects.name,
        topicName: topics.name,
        lastErrorType: this.lastErrorType(user.id),
      })
      .from(reviewItems)
      .innerJoin(questions, eq(questions.id, reviewItems.questionId))
      .leftJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .where(eq(reviewItems.userId, user.id))
      .orderBy(asc(reviewItems.dueDate));

    const all: ReviewItemDto[] = rows.map((r) => ({
      id: r.item.id,
      questionId: r.item.questionId,
      stage: r.item.stage,
      dueDate: r.item.dueDate,
      status: r.item.status,
      bucket: reviewBucket({ stage: r.item.stage, dueDate: r.item.dueDate, status: r.item.status }, today),
      statementPreview:
        preview(r.statement) ?? (r.externalSource ? `Registrada de: ${r.externalSource}` : null),
      subjectName: r.subjectName,
      topicName: r.topicName,
      lastErrorType: r.lastErrorType,
    }));
    const counts = { hoje: 0, atrasada: 0, futura: 0, concluida: 0 };
    for (const item of all) counts[item.bucket]++;
    return { counts, items: bucket ? all.filter((i) => i.bucket === bucket) : all };
  }

  async errorNotebook(
    user: CurrentUser,
    filters: { subjectId?: string | undefined; errorType?: ErrorTypeValue | undefined },
  ) {
    const conditions: SQL[] = [eq(questionAttempts.userId, user.id), eq(questionAttempts.isCorrect, false)];
    if (filters.subjectId) conditions.push(eq(questions.subjectId, filters.subjectId));
    const rows = await this.db
      .select({
        questionId: questions.id,
        statement: questions.statement,
        externalSource: questions.externalSource,
        subjectName: subjects.name,
        topicName: topics.name,
        board: boards.name,
        wrongCount: sql<number>`count(*)::int`,
        lastWrongAt: sql<Date>`max(${questionAttempts.answeredAt})`,
        lastErrorType: this.lastErrorType(user.id),
      })
      .from(questionAttempts)
      .innerJoin(questions, eq(questions.id, questionAttempts.questionId))
      .leftJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .leftJoin(boards, eq(boards.id, questions.boardId))
      .where(and(...conditions))
      .groupBy(questions.id, subjects.name, topics.name, boards.name)
      .orderBy(desc(sql`max(${questionAttempts.answeredAt})`));

    const ids = rows.map((r) => r.questionId);
    const reviews = ids.length
      ? await this.db
          .select()
          .from(reviewItems)
          .where(and(eq(reviewItems.userId, user.id), inArray(reviewItems.questionId, ids)))
      : [];
    const reviewByQuestion = new Map(reviews.map((r) => [r.questionId, r]));

    let entries: ErrorNotebookEntry[] = rows.map((r) => ({
      questionId: r.questionId,
      statementPreview:
        preview(r.statement) ?? (r.externalSource ? `Registrada de: ${r.externalSource}` : null),
      subjectName: r.subjectName,
      topicName: r.topicName,
      board: r.board,
      wrongCount: r.wrongCount,
      lastWrongAt: new Date(r.lastWrongAt).toISOString(),
      lastErrorType: r.lastErrorType,
      review: reviewDto(reviewByQuestion.get(r.questionId)),
    }));
    if (filters.errorType) entries = entries.filter((e) => e.lastErrorType === filters.errorType);

    const distribution = new Map<ErrorTypeValue | null, number>();
    for (const e of entries) distribution.set(e.lastErrorType, (distribution.get(e.lastErrorType) ?? 0) + 1);
    return {
      distribution: [...distribution].map(([errorType, count]) => ({ errorType, count })),
      entries,
    };
  }
}
