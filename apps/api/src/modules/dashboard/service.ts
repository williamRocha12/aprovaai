// Métricas do dashboard, todas calculadas a partir de dados persistidos.
import {
  addDays,
  daysBetween,
  studyStreak,
  todayIn,
  weeklyAccuracy,
  worstHighWeightTopics,
  type TopicAccuracy,
} from "@aprovaai/core";
import {
  exams,
  questionAttempts,
  questions,
  reviewItems,
  studySessions,
  studyTasks,
  subjects,
  userExamGoals,
  type Database,
} from "@aprovaai/db";
import { ERROR_TYPES, type Dashboard, type ErrorTypeValue } from "@aprovaai/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { CurrentUser } from "../../plugins/auth-context";
import type { PlanRepository } from "../plan/repository";

const accuracy = (correct: number, answered: number) =>
  answered === 0 ? null : Math.round((correct / answered) * 1000) / 10;

export class DashboardService {
  constructor(
    private readonly db: Database,
    private readonly planRepo: PlanRepository,
  ) {}

  async get(user: CurrentUser): Promise<Dashboard> {
    const tz = user.timezone;
    const today = todayIn(tz);
    const weekAgo = addDays(today, -6);
    const localDate = (column: unknown) =>
      sql<string>`to_char((${column} at time zone ${tz})::date, 'YYYY-MM-DD')`;
    const since400 = new Date(Date.now() - 400 * 86_400_000);

    const [goalRow] = await this.db
      .select({
        goal: userExamGoals,
        examTitle: exams.title,
        isSample: exams.isSample,
        examDate: exams.examDate,
        datesConfirmed: exams.datesConfirmed,
      })
      .from(userExamGoals)
      .innerJoin(exams, eq(exams.id, userExamGoals.examId))
      .where(and(eq(userExamGoals.userId, user.id), eq(userExamGoals.isActive, true)));
    const goal = goalRow?.goal ?? null;
    const examDate = goal
      ? (goal.targetExamDate ?? (goalRow?.datesConfirmed ? goalRow.examDate : null))
      : null;

    const [sessionDays, attemptRows, completedTaskDays] = await Promise.all([
      this.db
        .select({
          day: localDate(studySessions.startedAt),
          minutes: sql<number>`sum(${studySessions.netMinutes})::int`,
        })
        .from(studySessions)
        .where(and(eq(studySessions.userId, user.id), gte(studySessions.startedAt, since400)))
        .groupBy(sql`1`),
      this.db
        .select({
          day: localDate(questionAttempts.answeredAt),
          isCorrect: questionAttempts.isCorrect,
          errorType: questionAttempts.errorType,
          subjectName: subjects.name,
          topicId: questions.topicId,
        })
        .from(questionAttempts)
        .innerJoin(questions, eq(questions.id, questionAttempts.questionId))
        .leftJoin(subjects, eq(subjects.id, questions.subjectId))
        .where(and(eq(questionAttempts.userId, user.id), eq(questions.annulled, false))),
      this.db
        .select({ day: localDate(studyTasks.completedAt) })
        .from(studyTasks)
        .where(
          and(
            eq(studyTasks.userId, user.id),
            eq(studyTasks.status, "concluida"),
            gte(studyTasks.completedAt, since400),
          ),
        )
        .groupBy(sql`1`),
    ]);

    // Semana: minutos líquidos (sessões), planejado e concluído do ciclo atual.
    const netMinutes = sessionDays
      .filter((s) => s.day >= weekAgo && s.day <= today)
      .reduce((a, s) => a + s.minutes, 0);
    let plannedMinutes = 0;
    let completedMinutes = 0;
    if (goal) {
      const cycle = await this.planRepo.activeCycle(user.id, goal.id);
      if (cycle) {
        const tasks = await this.db
          .select({ status: studyTasks.status, durationMin: studyTasks.durationMin })
          .from(studyTasks)
          .where(
            and(
              eq(studyTasks.userId, user.id),
              eq(studyTasks.cycleId, cycle.id),
              inArray(studyTasks.status, ["pendente", "em_andamento", "concluida"]),
            ),
          );
        plannedMinutes = tasks.reduce((a, t) => a + t.durationMin, 0);
        completedMinutes = tasks
          .filter((t) => t.status === "concluida")
          .reduce((a, t) => a + t.durationMin, 0);
      }
    }

    const activeDays = new Set([
      ...sessionDays.map((s) => s.day),
      ...completedTaskDays.map((t) => t.day),
      ...attemptRows.map((a) => a.day),
    ]);

    // Questões
    const answered = attemptRows.length;
    const correct = attemptRows.filter((a) => a.isCorrect).length;
    const weekly = weeklyAccuracy(
      attemptRows.map((a) => ({ date: a.day, correct: a.isCorrect })),
      today,
      8,
    );

    const subjectsMap = new Map<string, { answered: number; correct: number }>();
    for (const a of attemptRows) {
      const name = a.subjectName ?? "Sem disciplina";
      const s = subjectsMap.get(name) ?? { answered: 0, correct: 0 };
      s.answered++;
      if (a.isCorrect) s.correct++;
      subjectsMap.set(name, s);
    }
    const bySubject = [...subjectsMap]
      .map(([name, s]) => ({ name, ...s, accuracy: accuracy(s.correct, s.answered) }))
      .sort((a, b) => b.answered - a.answered);

    const errorCounts = new Map<ErrorTypeValue, number>();
    for (const a of attemptRows)
      if (!a.isCorrect && a.errorType) errorCounts.set(a.errorType, (errorCounts.get(a.errorType) ?? 0) + 1);
    const errorDistribution = ERROR_TYPES.filter((t) => errorCounts.has(t)).map((t) => ({
      errorType: t,
      count: errorCounts.get(t) ?? 0,
    }));

    // Assuntos do plano: cobertura e piores com peso alto.
    let coverage = { covered: 0, total: 0 };
    let worstTopics: Dashboard["worstTopics"] = [];
    if (goal) {
      const states = (await this.planRepo.topicStates(user.id, goal.id)).filter((s) => s.isActive);
      coverage = { covered: states.filter((s) => s.status === "coberto").length, total: states.length };
      const byTopic = new Map<string, { answered: number; correct: number }>();
      for (const a of attemptRows) {
        if (!a.topicId) continue;
        const t = byTopic.get(a.topicId) ?? { answered: 0, correct: 0 };
        t.answered++;
        if (a.isCorrect) t.correct++;
        byTopic.set(a.topicId, t);
      }
      const candidates: TopicAccuracy[] = states.map((s) => ({
        id: s.noticeTopicId,
        name: s.topicName,
        subjectName: s.subjectName,
        weight: s.subjectWeight * s.relevance,
        answered: byTopic.get(s.topicId)?.answered ?? 0,
        correct: byTopic.get(s.topicId)?.correct ?? 0,
      }));
      worstTopics = worstHighWeightTopics(candidates).map((t) => ({
        id: t.id,
        name: t.name,
        subjectName: t.subjectName,
        answered: t.answered,
        accuracy: accuracy(t.correct, t.answered) ?? 0,
      }));
    }

    const [reviewCounts] = await this.db
      .select({
        today: sql<number>`count(*) filter (where ${reviewItems.dueDate} = ${today})::int`,
        overdue: sql<number>`count(*) filter (where ${reviewItems.dueDate} < ${today})::int`,
      })
      .from(reviewItems)
      .where(and(eq(reviewItems.userId, user.id), eq(reviewItems.status, "ativa")));

    return {
      isSample: goalRow?.isSample ?? false,
      examTitle: goalRow?.examTitle ?? null,
      daysToExam: examDate ? daysBetween(today, examDate) : null,
      week: { netMinutes, plannedMinutes, completedMinutes },
      streakDays: studyStreak(activeDays, today),
      questions: { answered, correct, accuracy: accuracy(correct, answered) },
      weekly,
      bySubject,
      worstTopics,
      errorDistribution,
      coverage,
      reviews: { today: reviewCounts?.today ?? 0, overdue: reviewCounts?.overdue ?? 0 },
    };
  }
}
