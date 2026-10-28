// Acesso a dados do plano. TODA função recebe userId e filtra por ele (isolamento entre usuários).
import {
  examNotices,
  exams,
  noticeSubjects,
  noticeTopics,
  studyCycles,
  studySessions,
  studyTasks,
  subjects,
  topics,
  userExamGoals,
  userTopicStates,
  type Database,
} from "@aprovaai/db";
import { and, asc, desc, eq, gte, inArray, lte, max, notInArray, sql } from "drizzle-orm";

export type GoalRow = typeof userExamGoals.$inferSelect;
export type CycleRow = typeof studyCycles.$inferSelect;
export type TaskRow = typeof studyTasks.$inferSelect;

export interface TopicStateRow {
  noticeTopicId: string;
  noticeSubjectId: string;
  subjectName: string;
  topicName: string;
  topicId: string;
  subjectWeight: number;
  relevance: number;
  selfAssessment: number | null;
  status: "nao_iniciado" | "em_andamento" | "coberto";
  lastStudiedAt: Date | null;
  isActive: boolean;
}

export class PlanRepository {
  constructor(readonly db: Database) {}

  async activeGoal(
    userId: string,
  ): Promise<
    (GoalRow & { examTitle: string; catalogExamDate: string | null; datesConfirmed: boolean }) | null
  > {
    const [row] = await this.db
      .select({
        goal: userExamGoals,
        examTitle: exams.title,
        catalogExamDate: exams.examDate,
        datesConfirmed: exams.datesConfirmed,
      })
      .from(userExamGoals)
      .innerJoin(exams, eq(exams.id, userExamGoals.examId))
      .where(and(eq(userExamGoals.userId, userId), eq(userExamGoals.isActive, true)));
    return row
      ? {
          ...row.goal,
          examTitle: row.examTitle,
          catalogExamDate: row.catalogExamDate,
          datesConfirmed: row.datesConfirmed,
        }
      : null;
  }

  async goalById(userId: string, goalId: string): Promise<GoalRow | null> {
    const [row] = await this.db
      .select()
      .from(userExamGoals)
      .where(and(eq(userExamGoals.id, goalId), eq(userExamGoals.userId, userId)));
    return row ?? null;
  }

  /** Estado de todos os assuntos do objetivo (ativos e inativos), na ordem do edital. */
  async topicStates(userId: string, goalId: string): Promise<TopicStateRow[]> {
    return this.db
      .select({
        noticeTopicId: noticeTopics.id,
        noticeSubjectId: noticeSubjects.id,
        subjectName: subjects.name,
        topicName: topics.name,
        topicId: topics.id,
        subjectWeight: noticeSubjects.weight,
        relevance: noticeTopics.relevance,
        selfAssessment: userTopicStates.selfAssessment,
        status: userTopicStates.status,
        lastStudiedAt: userTopicStates.lastStudiedAt,
        isActive: userTopicStates.isActive,
      })
      .from(userTopicStates)
      .innerJoin(noticeTopics, eq(noticeTopics.id, userTopicStates.noticeTopicId))
      .innerJoin(noticeSubjects, eq(noticeSubjects.id, noticeTopics.noticeSubjectId))
      .innerJoin(subjects, eq(subjects.id, noticeSubjects.subjectId))
      .innerJoin(topics, eq(topics.id, noticeTopics.topicId))
      .where(and(eq(userTopicStates.userId, userId), eq(userTopicStates.goalId, goalId)))
      .orderBy(asc(noticeSubjects.sortOrder), asc(noticeTopics.sortOrder));
  }

  /** Disciplinas e assuntos de um edital (para criar os estados no onboarding). */
  async noticeStructure(noticeId: string) {
    return this.db
      .select({ noticeSubjectId: noticeSubjects.id, noticeTopicId: noticeTopics.id })
      .from(noticeSubjects)
      .innerJoin(noticeTopics, eq(noticeTopics.noticeSubjectId, noticeSubjects.id))
      .innerJoin(examNotices, eq(examNotices.id, noticeSubjects.noticeId))
      .where(eq(noticeSubjects.noticeId, noticeId));
  }

  async activeCycle(userId: string, goalId: string): Promise<CycleRow | null> {
    const [row] = await this.db
      .select()
      .from(studyCycles)
      .where(
        and(eq(studyCycles.userId, userId), eq(studyCycles.goalId, goalId), eq(studyCycles.status, "ativo")),
      );
    return row ?? null;
  }

  async nextCycleNumber(userId: string, goalId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: max(studyCycles.number) })
      .from(studyCycles)
      .where(and(eq(studyCycles.userId, userId), eq(studyCycles.goalId, goalId)));
    return (row?.value ?? 0) + 1;
  }

  /** Tarefas visíveis do ciclo (canceladas ficam só no histórico), com nomes para exibição. */
  async cycleTasks(userId: string, cycleId: string) {
    return this.db
      .select({
        task: studyTasks,
        topicName: topics.name,
        subjectName: subjects.name,
      })
      .from(studyTasks)
      .leftJoin(noticeTopics, eq(noticeTopics.id, studyTasks.noticeTopicId))
      .leftJoin(topics, eq(topics.id, noticeTopics.topicId))
      .leftJoin(noticeSubjects, eq(noticeSubjects.id, noticeTopics.noticeSubjectId))
      .leftJoin(subjects, eq(subjects.id, noticeSubjects.subjectId))
      .where(
        and(
          eq(studyTasks.userId, userId),
          eq(studyTasks.cycleId, cycleId),
          notInArray(studyTasks.status, ["cancelada"]),
        ),
      )
      .orderBy(asc(studyTasks.orderIndex));
  }

  async taskById(userId: string, taskId: string): Promise<TaskRow | null> {
    const [row] = await this.db
      .select()
      .from(studyTasks)
      .where(and(eq(studyTasks.id, taskId), eq(studyTasks.userId, userId)));
    return row ?? null;
  }

  /** Minutos já ocupados numa data (tarefas pendentes, em andamento ou concluídas). */
  async minutesOnDate(userId: string, cycleId: string, date: string, exceptTaskId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`coalesce(sum(${studyTasks.durationMin}), 0)::int` })
      .from(studyTasks)
      .where(
        and(
          eq(studyTasks.userId, userId),
          eq(studyTasks.cycleId, cycleId),
          eq(studyTasks.suggestedDate, date),
          inArray(studyTasks.status, ["pendente", "em_andamento", "concluida"]),
          sql`${studyTasks.id} <> ${exceptTaskId}`,
        ),
      );
    return row?.value ?? 0;
  }

  async completedTasksBetween(userId: string, goalId: string, from: Date) {
    return this.db
      .select({ durationMin: studyTasks.durationMin, completedAt: studyTasks.completedAt })
      .from(studyTasks)
      .where(
        and(
          eq(studyTasks.userId, userId),
          eq(studyTasks.goalId, goalId),
          eq(studyTasks.status, "concluida"),
          gte(studyTasks.completedAt, from),
        ),
      );
  }

  async markTopicStudied(
    userId: string,
    noticeTopicId: string,
    goalId: string,
    covered: boolean,
  ): Promise<void> {
    await this.db
      .update(userTopicStates)
      .set({
        lastStudiedAt: new Date(),
        status: covered
          ? "coberto"
          : sql`case when ${userTopicStates.status} = 'coberto' then 'coberto'::topic_study_status else 'em_andamento'::topic_study_status end`,
      })
      .where(
        and(
          eq(userTopicStates.userId, userId),
          eq(userTopicStates.goalId, goalId),
          eq(userTopicStates.noticeTopicId, noticeTopicId),
        ),
      );
  }

  async userOwnsNoticeTopic(userId: string, noticeTopicId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: userTopicStates.id })
      .from(userTopicStates)
      .where(and(eq(userTopicStates.userId, userId), eq(userTopicStates.noticeTopicId, noticeTopicId)))
      .limit(1);
    return Boolean(row);
  }

  async listSessions(userId: string, from?: Date, to?: Date) {
    const conditions = [eq(studySessions.userId, userId)];
    if (from) conditions.push(gte(studySessions.startedAt, from));
    if (to) conditions.push(lte(studySessions.startedAt, to));
    return this.db
      .select({ session: studySessions, topicName: topics.name })
      .from(studySessions)
      .leftJoin(noticeTopics, eq(noticeTopics.id, studySessions.noticeTopicId))
      .leftJoin(topics, eq(topics.id, noticeTopics.topicId))
      .where(and(...conditions))
      .orderBy(desc(studySessions.startedAt))
      .limit(200);
  }

  async sessionById(userId: string, sessionId: string) {
    const [row] = await this.db
      .select()
      .from(studySessions)
      .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
    return row ?? null;
  }
}
