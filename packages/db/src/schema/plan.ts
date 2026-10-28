// Plano de estudos do usuário: objetivo (concurso-alvo), estado por assunto, ciclos, tarefas e sessões.
// Tudo aqui é dado privado: user_id obrigatório e toda consulta filtra por ele.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import type { WeeklyAvailability } from "./account";
import { users } from "./auth";
import { examNotices, examPositions, exams, noticeTopics } from "./catalog";

export const topicStudyStatus = pgEnum("topic_study_status", ["nao_iniciado", "em_andamento", "coberto"]);
export const cyclePhase = pgEnum("cycle_phase", ["base", "inicial", "intermediaria", "reta_final"]);
export const cycleStatus = pgEnum("cycle_status", ["ativo", "encerrado"]);
/** Situação de cada concurso que o usuário estuda: vários podem estar ativos ao mesmo tempo. */
export const goalStatus = pgEnum("goal_status", ["ativo", "pausado", "encerrado"]);
export const taskType = pgEnum("task_type", [
  "teoria",
  "questoes",
  "revisao",
  "lei_seca",
  "simulado",
  "analise_erros",
]);
export const taskStatus = pgEnum("task_status", [
  "pendente",
  "em_andamento",
  "concluida",
  "pulada",
  "cancelada",
]);
export const sessionSource = pgEnum("session_source", ["manual", "cronometro", "pomodoro"]);

export interface PriorityWeightsJson {
  importance: number;
  difficulty: number;
  review: number;
  incidence: number;
  coverage: number;
}

export interface PlanMessageJson {
  code: string;
  message: string;
  ids?: string[];
}

export const userExamGoals = pgTable(
  "user_exam_goals",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    examId: uuid()
      .notNull()
      .references(() => exams.id),
    positionId: uuid().references(() => examPositions.id),
    noticeId: uuid()
      .notNull()
      .references(() => examNotices.id),
    /** Data da prova informada pelo usuário (sobrepõe a do catálogo). */
    targetExamDate: date(),
    weeklyAvailability: jsonb().$type<WeeklyAvailability>().notNull(),
    blockMinutes: integer().notNull().default(50),
    priorityWeights: jsonb().$type<PriorityWeightsJson>(),
    reviewIntervals: integer()
      .array()
      .notNull()
      .default(sql`'{1,7,30}'::integer[]`),
    status: goalStatus().notNull().default("ativo"),
    ...timestamps,
  },
  (t) => [
    // O mesmo edital não pode ser estudado em dois objetivos abertos ao mesmo tempo.
    uniqueIndex("user_exam_goals_open_notice")
      .on(t.userId, t.noticeId)
      .where(sql`${t.status} <> 'encerrado'`),
    index("user_exam_goals_user_idx").on(t.userId, t.status),
    check("user_exam_goals_block_range", sql`${t.blockMinutes} BETWEEN 15 AND 240`),
  ],
);

export const userTopicStates = pgTable(
  "user_topic_states",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid()
      .notNull()
      .references(() => userExamGoals.id, { onDelete: "cascade" }),
    noticeTopicId: uuid()
      .notNull()
      .references(() => noticeTopics.id, { onDelete: "cascade" }),
    isActive: boolean().notNull().default(true),
    selfAssessment: integer(),
    status: topicStudyStatus().notNull().default("nao_iniciado"),
    lastStudiedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_topic_states_unique").on(t.goalId, t.noticeTopicId),
    index("user_topic_states_user_idx").on(t.userId),
    check(
      "user_topic_states_self_assessment_range",
      sql`${t.selfAssessment} IS NULL OR ${t.selfAssessment} BETWEEN 0 AND 100`,
    ),
  ],
);

export const studyCycles = pgTable(
  "study_cycles",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid()
      .notNull()
      .references(() => userExamGoals.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    phase: cyclePhase().notNull(),
    startDate: date().notNull(),
    endDate: date().notNull(),
    status: cycleStatus().notNull().default("ativo"),
    /** Hash da entrada do motor: prova de determinismo e auditoria do cálculo. */
    inputHash: text().notNull(),
    conflicts: jsonb().$type<PlanMessageJson[]>().notNull().default([]),
    warnings: jsonb().$type<PlanMessageJson[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index("study_cycles_goal_idx").on(t.goalId, t.number),
    uniqueIndex("study_cycles_one_active")
      .on(t.goalId)
      .where(sql`${t.status} = 'ativo'`),
  ],
);

export const studyTasks = pgTable(
  "study_tasks",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid()
      .notNull()
      .references(() => userExamGoals.id, { onDelete: "cascade" }),
    cycleId: uuid()
      .notNull()
      .references(() => studyCycles.id, { onDelete: "cascade" }),
    /** NULL em simulados (cobrem várias disciplinas). */
    noticeTopicId: uuid().references(() => noticeTopics.id, { onDelete: "set null" }),
    type: taskType().notNull(),
    suggestedDate: date().notNull(),
    orderIndex: integer().notNull(),
    durationMin: integer().notNull(),
    priority: numeric({ precision: 6, scale: 4, mode: "number" }).notNull().default(0),
    justification: text().notNull(),
    status: taskStatus().notNull().default("pendente"),
    completedAt: timestamp({ withTimezone: true }),
    supersededByCycleId: uuid().references(() => studyCycles.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("study_tasks_queue_idx").on(t.userId, t.cycleId, t.status, t.orderIndex),
    index("study_tasks_date_idx").on(t.userId, t.suggestedDate),
    check("study_tasks_duration_positive", sql`${t.durationMin} > 0`),
  ],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid().references(() => studyTasks.id, { onDelete: "set null" }),
    noticeTopicId: uuid().references(() => noticeTopics.id, { onDelete: "set null" }),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    netMinutes: integer().notNull(),
    source: sessionSource().notNull().default("manual"),
    notes: text(),
    ...timestamps,
  },
  (t) => [
    index("study_sessions_user_date_idx").on(t.userId, t.startedAt),
    check("study_sessions_net_minutes_positive", sql`${t.netMinutes} > 0`),
  ],
);
