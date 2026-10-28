// Recursos de IA: gate (flag + chave), cota por usuário, registro de uso e regras de cada recurso.
// A IA propõe; quem decide é a pessoa (edital só é salvo depois da confirmação; classificação só é aplicada pelo dono).
import {
  aiExplanations,
  aiInteractions,
  boards,
  questionAttempts,
  questionOptions,
  questions,
  subjects,
  topics,
  type Database,
} from "@aprovaai/db";
import { noticeImportSchema, type NoticeImportInput } from "@aprovaai/shared";
import { and, asc, count, eq, gte, isNull, or } from "drizzle-orm";
import type { AppConfig } from "../../config";
import { estimateCostUsd } from "../../lib/ai/anthropic";
import type { AiNotice, AiProvider, AiResult, QuestionForAi } from "../../lib/ai/provider";
import { AppError, notFound } from "../../lib/errors";
import { isFlagEnabled } from "../../lib/feature-flags";
import type { CurrentUser } from "../../plugins/auth-context";
import type { PlanRepository } from "../plan/repository";

type Feature = "notice_extract" | "question_classify" | "question_explain";

/** Converte a saída plana da IA no formato de importação (que depois é validado de verdade). */
export function toImportInput(ai: AiNotice): NoticeImportInput {
  const clampRelevance = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
  const uf = ai.uf && /^[A-Za-z]{2}$/.test(ai.uf) ? ai.uf.toUpperCase() : undefined;
  const examDate = ai.examDate && /^\d{4}-\d{2}-\d{2}$/.test(ai.examDate) ? ai.examDate : undefined;
  const boardSlug = ai.boardName
    ? ai.boardName
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50)
    : "";
  return {
    exam: {
      title: ai.examTitle,
      organization: {
        name: ai.organizationName,
        ...(ai.organizationAcronym ? { acronym: ai.organizationAcronym } : {}),
        sphere: ai.sphere,
        ...(uf ? { uf } : {}),
        ...(ai.city ? { city: ai.city } : {}),
      },
      ...(ai.boardName && boardSlug ? { board: { name: ai.boardName, slug: boardSlug } } : {}),
      sphere: ai.sphere,
      ...(uf ? { uf } : {}),
      ...(ai.city ? { city: ai.city } : {}),
      ...(ai.educationLevel ? { educationLevel: ai.educationLevel } : {}),
      situation: "edital_publicado",
      ...(examDate ? { examDate } : {}),
      // Data extraída por IA nunca nasce confirmada: um humano confere com a fonte oficial.
      datesConfirmed: false,
    },
    ...(ai.positionTitle
      ? {
          position: {
            title: ai.positionTitle,
            ...(ai.educationLevel ? { educationLevel: ai.educationLevel } : {}),
          },
        }
      : {}),
    notice: {
      title: ai.noticeTitle,
      scoringType: ai.scoringType,
      wrongPenalty: ai.scoringType === "wrong_cancels_right" ? 1 : 0,
    },
    subjects: ai.subjects.map((s) => ({
      name: s.name,
      weight: Math.max(0, s.weight),
      ...(s.questionCount !== null && s.questionCount >= 0
        ? { questionCount: Math.round(s.questionCount) }
        : {}),
      kind: s.kind,
      topics: s.topics.map((t) => ({
        name: t.name,
        relevance: clampRelevance(t.relevance),
        ...(t.rawText ? { rawText: t.rawText.slice(0, 2000) } : {}),
        ...(t.subtopics.length
          ? { subtopics: t.subtopics.map((name) => ({ name, relevance: clampRelevance(t.relevance) })) }
          : {}),
      })),
    })),
  };
}

export class AiService {
  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly provider: AiProvider | null,
    private readonly planRepo: PlanRepository,
  ) {}

  /** IA só funciona com a flag ligada E a chave configurada. Sem isso, o recurso não existe (nunca é simulado). */
  private async requireProvider(): Promise<AiProvider> {
    if (!this.provider || !(await isFlagEnabled(this.db, "ai"))) {
      throw new AppError(404, "NOT_FOUND", "Os recursos de IA estão desativados.");
    }
    return this.provider;
  }

  private async assertQuota(user: CurrentUser): Promise<void> {
    const since = new Date(Date.now() - 86_400_000);
    const [row] = await this.db
      .select({ value: count() })
      .from(aiInteractions)
      .where(and(eq(aiInteractions.userId, user.id), gte(aiInteractions.createdAt, since)));
    if ((row?.value ?? 0) >= this.config.AI_DAILY_QUOTA) {
      throw new AppError(
        429,
        "RATE_LIMITED",
        `Você atingiu o limite de ${this.config.AI_DAILY_QUOTA} usos de IA em 24 horas.`,
      );
    }
  }

  /** Registra a chamada (só metadados) e converte falhas em erro de API. */
  private async record<T>(user: CurrentUser, feature: Feature, result: AiResult<T>): Promise<T> {
    const usage = result.usage;
    await this.db.insert(aiInteractions).values({
      userId: user.id,
      feature,
      model: usage?.model ?? this.config.ANTHROPIC_MODEL,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: usage ? estimateCostUsd(usage) : null,
      status: result.ok ? "ok" : result.reason === "provider_error" ? "error" : result.reason,
      errorCode: result.ok ? null : result.reason,
    });
    if (!result.ok) {
      // Provedor fora do ar → 502; recusa ou resposta inválida → 422. A mensagem é segura para exibir.
      throw new AppError(result.reason === "provider_error" ? 502 : 422, "AI_ERROR", result.message);
    }
    return result.data;
  }

  // ---------- Importação assistida de edital ----------

  async extractNotice(user: CurrentUser, text: string) {
    const provider = await this.requireProvider();
    await this.assertQuota(user);
    const ai = await this.record(user, "notice_extract", await provider.extractNotice(text));
    const proposal = toImportInput(ai);
    const check = noticeImportSchema.safeParse(proposal);
    return {
      proposal,
      warnings: ai.warnings,
      // Problemas que o usuário precisa corrigir antes de salvar (a confirmação humana é obrigatória).
      issues: check.success
        ? []
        : check.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
    };
  }

  // ---------- Questões ----------

  private async questionForAi(user: CurrentUser, questionId: string) {
    const visible = or(
      and(isNull(questions.ownerUserId), eq(questions.contentStatus, "validado")),
      eq(questions.ownerUserId, user.id),
    );
    const [row] = await this.db
      .select({ q: questions, board: boards.name, subjectName: subjects.name, topicName: topics.name })
      .from(questions)
      .leftJoin(boards, eq(boards.id, questions.boardId))
      .leftJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .where(and(eq(questions.id, questionId), visible));
    if (!row) throw notFound("Questão não encontrada.");
    if (!row.q.statement)
      throw new AppError(409, "CONFLICT", "Questão sem enunciado: a IA não tem o que analisar.");
    const options = await this.db
      .select({ label: questionOptions.label, text: questionOptions.text })
      .from(questionOptions)
      .where(eq(questionOptions.questionId, row.q.id))
      .orderBy(asc(questionOptions.sortOrder));
    const forAi: QuestionForAi = {
      type: row.q.type,
      statement: row.q.statement,
      options,
      correctAnswer: row.q.correctAnswer,
      board: row.board,
      subjectName: row.subjectName,
      topicName: row.topicName,
    };
    return { question: row.q, forAi };
  }

  async classifyQuestion(user: CurrentUser, questionId: string) {
    const provider = await this.requireProvider();
    const { question, forAi } = await this.questionForAi(user, questionId);
    if (question.ownerUserId !== user.id) {
      throw new AppError(403, "FORBIDDEN", "Só é possível classificar as suas próprias questões.");
    }
    const goal = await this.planRepo.activeGoal(user.id);
    if (!goal)
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Configure seu plano: a classificação usa os assuntos do seu edital.",
      );
    const states = await this.planRepo.topicStates(user.id, goal.id);
    const taxonomy = states.map((s) => ({
      topicId: s.topicId,
      subjectName: s.subjectName,
      topicName: s.topicName,
      subjectId: s.subjectId,
    }));
    await this.assertQuota(user);
    const result = await this.record(
      user,
      "question_classify",
      await provider.classifyQuestion(forAi, taxonomy),
    );
    const match = taxonomy.find((t) => t.topicId === result.topicId) ?? null;
    return {
      topicId: match?.topicId ?? null,
      subjectId: match?.subjectId ?? null,
      topicName: match?.topicName ?? null,
      subjectName: match?.subjectName ?? null,
      confidence: match ? result.confidence : ("baixa" as const),
      reason: result.reason,
      generatedByAi: true as const,
    };
  }

  async explainQuestion(user: CurrentUser, questionId: string) {
    const provider = await this.requireProvider();
    const { question, forAi } = await this.questionForAi(user, questionId);
    // Só explica depois que a pessoa respondeu (o gabarito já foi revelado para ela).
    const [answered] = await this.db
      .select({ id: questionAttempts.id })
      .from(questionAttempts)
      .where(and(eq(questionAttempts.questionId, question.id), eq(questionAttempts.userId, user.id)))
      .limit(1);
    if (!answered) throw new AppError(409, "CONFLICT", "Responda a questão antes de pedir a explicação.");
    if (!question.correctAnswer)
      throw new AppError(409, "CONFLICT", "Questão sem gabarito: a IA não explica sem referência.");

    const [cached] = await this.db
      .select()
      .from(aiExplanations)
      .where(eq(aiExplanations.questionId, question.id));
    if (cached)
      return {
        explanation: cached.body,
        model: cached.model,
        cached: true,
        hasEvidence: true,
        generatedByAi: true as const,
      };

    await this.assertQuota(user);
    const result = await this.record(user, "question_explain", await provider.explainQuestion(forAi));
    if (result.hasEvidence) {
      await this.db
        .insert(aiExplanations)
        .values({ questionId: question.id, body: result.explanation, model: this.config.ANTHROPIC_MODEL })
        .onConflictDoNothing();
    }
    return {
      explanation: result.explanation,
      model: this.config.ANTHROPIC_MODEL,
      cached: false,
      hasEvidence: result.hasEvidence,
      generatedByAi: true as const,
    };
  }
}
