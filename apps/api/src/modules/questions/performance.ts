// Desempenho por assunto do edital, para o planejador: acerto recente, tipos de erro e revisões vencidas.
// O assunto do edital (notice_topic) aponta para o assunto da taxonomia (topic), que é o que as questões usam.
import type { ErrorType } from "@aprovaai/core";
import { noticeTopics, questionAttempts, questions, reviewItems, type Database } from "@aprovaai/db";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { PerformanceProvider, TopicPerformance } from "../plan/service";

/** Janela de tentativas consideradas "recentes" para o acerto e o perfil de erros. */
export const PERFORMANCE_WINDOW_DAYS = 90;

export function createPerformanceProvider(db: Database): PerformanceProvider {
  return async (userId, noticeTopicIds, today) => {
    const result = new Map<string, TopicPerformance>();
    if (noticeTopicIds.length === 0) return result;

    const mapping = await db
      .select({ noticeTopicId: noticeTopics.id, topicId: noticeTopics.topicId })
      .from(noticeTopics)
      .where(inArray(noticeTopics.id, noticeTopicIds));
    const topicIds = [...new Set(mapping.map((m) => m.topicId))];
    if (topicIds.length === 0) return result;
    const since = new Date(Date.now() - PERFORMANCE_WINDOW_DAYS * 86_400_000);

    const [stats, errors, overdue] = await Promise.all([
      db
        .select({
          topicId: questions.topicId,
          attempts: sql<number>`count(*)::int`,
          correct: sql<number>`count(*) filter (where ${questionAttempts.isCorrect})::int`,
        })
        .from(questionAttempts)
        .innerJoin(questions, eq(questions.id, questionAttempts.questionId))
        .where(
          and(
            eq(questionAttempts.userId, userId),
            inArray(questions.topicId, topicIds),
            gte(questionAttempts.answeredAt, since),
          ),
        )
        .groupBy(questions.topicId),
      db
        .select({
          topicId: questions.topicId,
          errorType: questionAttempts.errorType,
          total: sql<number>`count(*)::int`,
        })
        .from(questionAttempts)
        .innerJoin(questions, eq(questions.id, questionAttempts.questionId))
        .where(
          and(
            eq(questionAttempts.userId, userId),
            eq(questionAttempts.isCorrect, false),
            inArray(questions.topicId, topicIds),
            gte(questionAttempts.answeredAt, since),
            sql`${questionAttempts.errorType} is not null`,
          ),
        )
        .groupBy(questions.topicId, questionAttempts.errorType),
      db
        .select({ topicId: questions.topicId, total: sql<number>`count(*)::int` })
        .from(reviewItems)
        .innerJoin(questions, eq(questions.id, reviewItems.questionId))
        .where(
          and(
            eq(reviewItems.userId, userId),
            eq(reviewItems.status, "ativa"),
            lt(reviewItems.dueDate, today),
            inArray(questions.topicId, topicIds),
          ),
        )
        .groupBy(questions.topicId),
    ]);

    const byTopic = new Map<string, TopicPerformance>();
    const get = (topicId: string) => {
      let perf = byTopic.get(topicId);
      if (!perf) {
        perf = { attempts: 0, correct: 0, errorCounts: {}, overdueReviews: 0 };
        byTopic.set(topicId, perf);
      }
      return perf;
    };
    for (const s of stats)
      if (s.topicId) Object.assign(get(s.topicId), { attempts: s.attempts, correct: s.correct });
    for (const e of errors)
      if (e.topicId && e.errorType) get(e.topicId).errorCounts[e.errorType as ErrorType] = e.total;
    for (const o of overdue) if (o.topicId) get(o.topicId).overdueReviews = o.total;

    for (const m of mapping) {
      const perf = byTopic.get(m.topicId);
      if (perf) result.set(m.noticeTopicId, perf);
    }
    return result;
  };
}
