// Simulados montados pelo usuário, com a regra de pontuação do edital.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { users } from "./auth";
import { scoringType } from "./catalog";
import { userExamGoals } from "./plan";
import { questions } from "./questions";

export interface MockExamConfigJson {
  subjectIds: string[];
  questionCount: number;
  preferUnanswered: boolean;
  /** Quantas questões de cada disciplina (subjectId → quantidade), já resolvido na montagem. */
  distribution: Record<string, number>;
}

export const mockExams = pgTable(
  "mock_exams",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid().references(() => userExamGoals.id, { onDelete: "set null" }),
    title: text().notNull(),
    config: jsonb().$type<MockExamConfigJson>().notNull(),
    scoringType: scoringType().notNull().default("standard"),
    wrongPenalty: numeric({ precision: 4, scale: 2, mode: "number" }).notNull().default(0),
    timeLimitMin: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mock_exams_user_idx").on(t.userId, t.createdAt),
    check("mock_exams_time_limit_positive", sql`${t.timeLimitMin} IS NULL OR ${t.timeLimitMin} > 0`),
  ],
);

export const mockExamQuestions = pgTable(
  "mock_exam_questions",
  {
    mockExamId: uuid()
      .notNull()
      .references(() => mockExams.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull(),
  },
  (t) => [uniqueIndex("mock_exam_questions_unique").on(t.mockExamId, t.questionId)],
);

export interface MockExamResultJson {
  score: number;
  maxScore: number;
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  accuracy: number | null;
  averageTimeSec: number | null;
  timeExceeded: boolean;
  bySubject: {
    subjectId: string;
    name: string;
    total: number;
    correct: number;
    wrong: number;
    blank: number;
    accuracy: number | null;
  }[];
  byTopic: { topicId: string; name: string; total: number; correct: number; accuracy: number | null }[];
  wrongQuestionIds: string[];
  recommendations: string[];
}

export const mockExamAttempts = pgTable(
  "mock_exam_attempts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mockExamId: uuid()
      .notNull()
      .references(() => mockExams.id, { onDelete: "cascade" }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    finished: boolean().notNull().default(false),
    result: jsonb().$type<MockExamResultJson>(),
  },
  (t) => [index("mock_exam_attempts_user_idx").on(t.userId, t.startedAt)],
);
