// Simulados: montagem pela distribuição do edital, aplicação com tempo e correção pela regra do edital.
import { scoreMockExam, type ScoredAnswer } from "@aprovaai/core";
import {
  examNotices,
  mockExamAttempts,
  mockExamQuestions,
  mockExams,
  noticeSubjects,
  questionAttempts,
  questionOptions,
  questions,
  subjects,
  topics,
  type Database,
  type MockExamResultJson,
} from "@aprovaai/db";
import type { MockExamResult, MockExamSession, MockExamSummary } from "@aprovaai/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { AppError, conflict, notFound } from "../../lib/errors";
import type { CurrentUser } from "../../plugins/auth-context";
import type { PlanRepository } from "../plan/repository";
import type { QuestionsService } from "../questions/service";

/** Tolerância para o envio depois do tempo-limite (latência, último clique). */
const TIME_GRACE_MS = 60_000;

/**
 * Distribui `total` questões entre disciplinas proporcionalmente ao peso (maiores restos),
 * respeitando quantas existem de cada uma. Função pura, exportada para teste.
 */
export function distributeQuestions(
  weights: Map<string, number>,
  available: Map<string, number>,
  total: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const ids = [...weights.keys()].filter((id) => (available.get(id) ?? 0) > 0).sort();
  let remaining = Math.min(
    total,
    ids.reduce((s, id) => s + (available.get(id) ?? 0), 0),
  );
  let pool = [...ids];
  while (remaining > 0 && pool.length > 0) {
    const weightSum = pool.reduce((s, id) => s + Math.max(weights.get(id) ?? 0, 0.0001), 0);
    const shares = pool.map((id) => {
      const exact = (remaining * Math.max(weights.get(id) ?? 0, 0.0001)) / weightSum;
      return { id, base: Math.floor(exact), rest: exact - Math.floor(exact) };
    });
    let assigned = shares.reduce((s, x) => s + x.base, 0);
    for (const share of [...shares].sort((a, b) => b.rest - a.rest || (a.id < b.id ? -1 : 1))) {
      if (assigned >= remaining) break;
      share.base++;
      assigned++;
    }
    const next: string[] = [];
    let used = 0;
    for (const share of shares) {
      const room = (available.get(share.id) ?? 0) - (result.get(share.id) ?? 0);
      const take = Math.min(share.base, room);
      result.set(share.id, (result.get(share.id) ?? 0) + take);
      used += take;
      if (room - take > 0) next.push(share.id);
    }
    if (used === 0) break;
    remaining -= used;
    pool = next;
  }
  return result;
}

const accuracyOf = (correct: number, answered: number) =>
  answered === 0 ? null : Math.round((correct / answered) * 1000) / 10;

export class MockExamsService {
  constructor(
    private readonly db: Database,
    private readonly planRepo: PlanRepository,
    private readonly questions: QuestionsService,
  ) {}

  async list(user: CurrentUser): Promise<MockExamSummary[]> {
    const exams = await this.db
      .select({
        exam: mockExams,
        questionCount: sql<number>`(select count(*)::int from ${mockExamQuestions} mq where mq.mock_exam_id = ${mockExams.id})`,
      })
      .from(mockExams)
      .where(eq(mockExams.userId, user.id))
      .orderBy(desc(mockExams.createdAt));
    const ids = exams.map((e) => e.exam.id);
    const attempts = ids.length
      ? await this.db
          .select()
          .from(mockExamAttempts)
          .where(and(eq(mockExamAttempts.userId, user.id), inArray(mockExamAttempts.mockExamId, ids)))
          .orderBy(desc(mockExamAttempts.startedAt))
      : [];
    return exams.map(({ exam, questionCount }) => {
      const last = attempts.find((a) => a.mockExamId === exam.id);
      return {
        id: exam.id,
        title: exam.title,
        questionCount,
        timeLimitMin: exam.timeLimitMin,
        scoringType: exam.scoringType,
        wrongPenalty: exam.wrongPenalty,
        createdAt: exam.createdAt.toISOString(),
        lastAttempt: last
          ? {
              id: last.id,
              finished: last.finished,
              score: last.result?.score ?? null,
              maxScore: last.result?.maxScore ?? null,
            }
          : null,
      };
    });
  }

  async create(
    user: CurrentUser,
    input: {
      title?: string | undefined;
      subjectIds: string[];
      questionCount: number;
      timeLimitMin?: number | null | undefined;
      preferUnanswered: boolean;
    },
  ): Promise<{ id: string; questionCount: number }> {
    const goal = await this.planRepo.activeGoal(user.id);
    const states = goal ? (await this.planRepo.topicStates(user.id, goal.id)).filter((s) => s.isActive) : [];
    const subjectIds =
      input.subjectIds.length > 0 ? input.subjectIds : [...new Set(states.map((s) => s.subjectId))];
    if (subjectIds.length === 0) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Escolha as disciplinas ou configure seu plano de estudos.",
      );
    }

    // Peso = nº de questões da disciplina no edital do plano (estilo da prova); sem edital, partes iguais.
    const weights = new Map(subjectIds.map((id) => [id, 1]));
    let scoringType: "standard" | "wrong_cancels_right" = "standard";
    let wrongPenalty = 0;
    if (goal) {
      const noticeRows = await this.db
        .select({
          subjectId: noticeSubjects.subjectId,
          questionCount: noticeSubjects.questionCount,
          weight: noticeSubjects.weight,
        })
        .from(noticeSubjects)
        .where(eq(noticeSubjects.noticeId, goal.noticeId));
      for (const row of noticeRows) {
        if (weights.has(row.subjectId)) weights.set(row.subjectId, row.questionCount ?? row.weight);
      }
      const [notice] = await this.db.select().from(examNotices).where(eq(examNotices.id, goal.noticeId));
      if (notice) {
        scoringType = notice.scoringType;
        wrongPenalty = notice.wrongPenalty;
      }
    }

    // Questões aplicáveis: visíveis, com enunciado e gabarito, não anuladas.
    const visible = or(
      and(isNull(questions.ownerUserId), eq(questions.contentStatus, "validado")),
      eq(questions.ownerUserId, user.id),
    );
    const candidates = await this.db
      .select({
        id: questions.id,
        subjectId: questions.subjectId,
        answered: sql<boolean>`exists(select 1 from ${questionAttempts} qa where qa.question_id = ${questions.id} and qa.user_id = ${user.id})`,
      })
      .from(questions)
      .where(
        and(
          visible,
          inArray(questions.subjectId, subjectIds),
          isNotNull(questions.statement),
          isNotNull(questions.correctAnswer),
          eq(questions.annulled, false),
        ),
      )
      .orderBy(sql`random()`);

    const bySubject = new Map<string, { id: string; answered: boolean }[]>();
    for (const c of candidates) {
      if (!c.subjectId) continue;
      bySubject.set(c.subjectId, [...(bySubject.get(c.subjectId) ?? []), c]);
    }
    const available = new Map([...bySubject].map(([id, list]) => [id, list.length]));
    const distribution = distributeQuestions(weights, available, input.questionCount);
    const chosen: string[] = [];
    for (const [subjectId, quantity] of distribution) {
      const pool = [...(bySubject.get(subjectId) ?? [])];
      if (input.preferUnanswered) pool.sort((a, b) => Number(a.answered) - Number(b.answered));
      chosen.push(...pool.slice(0, quantity).map((q) => q.id));
    }
    if (chosen.length < 5) {
      throw conflict(
        `Questões insuficientes para montar o simulado: só ${chosen.length} disponíveis nessas disciplinas.`,
      );
    }

    const title =
      input.title ?? `Simulado de ${new Date().toLocaleDateString("pt-BR", { timeZone: user.timezone })}`;
    return this.db.transaction(async (tx) => {
      const [exam] = await tx
        .insert(mockExams)
        .values({
          userId: user.id,
          goalId: goal?.id ?? null,
          title,
          config: {
            subjectIds,
            questionCount: input.questionCount,
            preferUnanswered: input.preferUnanswered,
            distribution: Object.fromEntries(distribution),
          },
          scoringType,
          wrongPenalty,
          timeLimitMin: input.timeLimitMin ?? null,
        })
        .returning({ id: mockExams.id });
      if (!exam) throw new Error("Falha ao criar simulado.");
      await tx
        .insert(mockExamQuestions)
        .values(chosen.map((questionId, i) => ({ mockExamId: exam.id, questionId, sortOrder: i })));
      return { id: exam.id, questionCount: chosen.length };
    });
  }

  private async ownExam(user: CurrentUser, mockExamId: string) {
    const [exam] = await this.db
      .select()
      .from(mockExams)
      .where(and(eq(mockExams.id, mockExamId), eq(mockExams.userId, user.id)));
    if (!exam) throw notFound("Simulado não encontrado.");
    return exam;
  }

  private async ownAttempt(user: CurrentUser, attemptId: string) {
    const [attempt] = await this.db
      .select()
      .from(mockExamAttempts)
      .where(and(eq(mockExamAttempts.id, attemptId), eq(mockExamAttempts.userId, user.id)));
    if (!attempt) throw notFound("Tentativa de simulado não encontrada.");
    return attempt;
  }

  private async examQuestions(mockExamId: string) {
    const rows = await this.db
      .select({
        id: questions.id,
        order: mockExamQuestions.sortOrder,
        type: questions.type,
        statement: questions.statement,
        correctAnswer: questions.correctAnswer,
        subjectId: questions.subjectId,
        topicId: questions.topicId,
        subjectName: subjects.name,
        topicName: topics.name,
      })
      .from(mockExamQuestions)
      .innerJoin(questions, eq(questions.id, mockExamQuestions.questionId))
      .leftJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(topics, eq(topics.id, questions.topicId))
      .where(eq(mockExamQuestions.mockExamId, mockExamId))
      .orderBy(asc(mockExamQuestions.sortOrder));
    const options = rows.length
      ? await this.db
          .select()
          .from(questionOptions)
          .where(
            inArray(
              questionOptions.questionId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(questionOptions.sortOrder))
      : [];
    return rows.map((r) => ({
      ...r,
      options:
        r.type === "certo_errado"
          ? [
              { label: "C", text: "Certo" },
              { label: "E", text: "Errado" },
            ]
          : options.filter((o) => o.questionId === r.id).map((o) => ({ label: o.label, text: o.text })),
    }));
  }

  /** Inicia (ou retoma, se houver uma em aberto) a aplicação do simulado. */
  async start(user: CurrentUser, mockExamId: string): Promise<MockExamSession> {
    const exam = await this.ownExam(user, mockExamId);
    const [open] = await this.db
      .select()
      .from(mockExamAttempts)
      .where(
        and(
          eq(mockExamAttempts.mockExamId, exam.id),
          eq(mockExamAttempts.userId, user.id),
          eq(mockExamAttempts.finished, false),
        ),
      );
    const attempt =
      open ??
      (
        await this.db.insert(mockExamAttempts).values({ userId: user.id, mockExamId: exam.id }).returning()
      )[0];
    if (!attempt) throw new Error("Falha ao iniciar simulado.");
    return this.session(user, attempt.id);
  }

  async session(user: CurrentUser, attemptId: string): Promise<MockExamSession> {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.finished) throw conflict("Este simulado já foi finalizado.");
    const exam = await this.ownExam(user, attempt.mockExamId);
    const list = await this.examQuestions(exam.id);
    return {
      attemptId: attempt.id,
      mockExamId: exam.id,
      title: exam.title,
      startedAt: attempt.startedAt.toISOString(),
      timeLimitMin: exam.timeLimitMin,
      scoringType: exam.scoringType,
      wrongPenalty: exam.wrongPenalty,
      // Sem gabarito: só enunciado e alternativas.
      questions: list.map((q) => ({
        id: q.id,
        order: q.order,
        type: q.type,
        statement: q.statement ?? "",
        options: q.options,
        subjectName: q.subjectName,
        topicName: q.topicName,
      })),
    };
  }

  async finish(
    user: CurrentUser,
    attemptId: string,
    answers: { questionId: string; answer: string | null; timeSpentSec?: number | undefined }[],
  ): Promise<MockExamResult> {
    const attempt = await this.ownAttempt(user, attemptId);
    if (attempt.finished) return this.result(user, attemptId);
    const exam = await this.ownExam(user, attempt.mockExamId);
    const list = await this.examQuestions(exam.id);
    const answerById = new Map(answers.map((a) => [a.questionId, a]));
    for (const a of answers) {
      if (!list.some((q) => q.id === a.questionId))
        throw new AppError(400, "VALIDATION_ERROR", "Resposta para questão fora do simulado.");
    }

    const finishedAt = new Date();
    const timeExceeded =
      exam.timeLimitMin !== null &&
      finishedAt.getTime() - attempt.startedAt.getTime() > exam.timeLimitMin * 60_000 + TIME_GRACE_MS;

    const scored: ScoredAnswer[] = [];
    const wrongQuestionIds: string[] = [];
    for (const q of list) {
      const given = answerById.get(q.id);
      const correct = given?.answer ? given.answer === q.correctAnswer : null;
      scored.push({
        subjectId: q.subjectId ?? "sem-disciplina",
        topicId: q.topicId,
        correct,
        ...(given?.timeSpentSec !== undefined ? { timeSpentSec: given.timeSpentSec } : {}),
      });
      if (given?.answer) {
        const [inserted] = await this.db
          .insert(questionAttempts)
          .values({
            userId: user.id,
            questionId: q.id,
            answer: given.answer,
            isCorrect: correct === true,
            timeSpentSec: given.timeSpentSec,
            context: "simulado",
            mockExamAttemptId: attempt.id,
            idempotencyKey: `mock-${attempt.id}-${q.id}`,
          })
          .onConflictDoNothing()
          .returning({ id: questionAttempts.id });
        if (inserted) await this.questions.updateReview(user, q.id, correct === true);
        if (correct === false) wrongQuestionIds.push(q.id);
      }
    }

    const score = scoreMockExam(scored, {
      type: exam.scoringType,
      wrongPenalty: exam.wrongPenalty,
      pointsPerQuestion: 1,
    });
    const subjectNames = new Map(
      list.map((q) => [q.subjectId ?? "sem-disciplina", q.subjectName ?? "Sem disciplina"]),
    );
    const topicNames = new Map(
      list.filter((q) => q.topicId).map((q) => [q.topicId as string, q.topicName ?? "Sem assunto"]),
    );

    const bySubject = Object.entries(score.bySubject).map(([subjectId, g]) => ({
      subjectId,
      name: subjectNames.get(subjectId) ?? "Sem disciplina",
      total: g.total,
      correct: g.correct,
      wrong: g.wrong,
      blank: g.blank,
      accuracy: g.accuracy,
    }));
    const byTopic = Object.entries(score.byTopic).map(([topicId, g]) => ({
      topicId,
      name: topicNames.get(topicId) ?? "Sem assunto",
      total: g.total,
      correct: g.correct,
      accuracy: g.accuracy,
    }));

    const recommendations: string[] = [];
    for (const s of [...bySubject].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))) {
      if (s.total >= 2 && (s.accuracy ?? 0) < 60) {
        recommendations.push(
          `Reforce ${s.name}: ${s.accuracy ?? 0}% de acerto. O ciclo vai priorizar esses assuntos.`,
        );
      }
    }
    if (score.blank > 0) {
      recommendations.push(
        exam.scoringType === "wrong_cancels_right"
          ? `${score.blank} em branco. Com penalidade por erro, deixar em branco quando não sabe pode ser estratégico.`
          : `${score.blank} em branco. Sem penalidade por erro, vale responder todas.`,
      );
    }
    if (timeExceeded) recommendations.push("Você passou do tempo: treine questões cronometradas.");
    if (score.averageTimeSec !== null && score.averageTimeSec > 180) {
      recommendations.push(
        `Tempo médio de ${Math.round(score.averageTimeSec / 60)} min por questão: treine velocidade.`,
      );
    }
    if (wrongQuestionIds.length > 0)
      recommendations.push("As questões erradas já estão no caderno de erros e na revisão de amanhã.");
    if (recommendations.length === 0)
      recommendations.push("Ótimo desempenho: mantenha o ciclo e revise os erros antigos.");

    const result: MockExamResultJson = {
      score: score.score,
      maxScore: score.maxScore,
      total: score.total,
      correct: score.correct,
      wrong: score.wrong,
      blank: score.blank,
      accuracy: score.accuracy,
      averageTimeSec: score.averageTimeSec,
      timeExceeded,
      bySubject,
      byTopic,
      wrongQuestionIds,
      recommendations,
    };
    await this.db
      .update(mockExamAttempts)
      .set({ finished: true, finishedAt, result })
      .where(and(eq(mockExamAttempts.id, attempt.id), eq(mockExamAttempts.userId, user.id)));
    return this.result(user, attempt.id);
  }

  async result(user: CurrentUser, attemptId: string): Promise<MockExamResult> {
    const attempt = await this.ownAttempt(user, attemptId);
    if (!attempt.finished || !attempt.result || !attempt.finishedAt)
      throw conflict("O simulado ainda não foi finalizado.");
    const exam = await this.ownExam(user, attempt.mockExamId);
    return {
      attemptId: attempt.id,
      mockExamId: exam.id,
      title: exam.title,
      finishedAt: attempt.finishedAt.toISOString(),
      scoringType: exam.scoringType,
      wrongPenalty: exam.wrongPenalty,
      ...attempt.result,
      accuracy:
        attempt.result.accuracy ??
        accuracyOf(attempt.result.correct, attempt.result.correct + attempt.result.wrong),
    };
  }
}
