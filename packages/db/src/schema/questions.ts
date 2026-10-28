// Questões (catálogo + pessoais), tentativas, caderno de erros e revisão espaçada.
// owner_user_id NULL = questão do catálogo (validada por editor); preenchido = questão pessoal (privada).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./auth";
import { boards, contentOrigin, contentStatus, subjects, topics } from "./catalog";

export const questionType = pgEnum("question_type", ["multipla_escolha", "certo_errado"]);
export const errorType = pgEnum("error_type", [
  "falta_de_teoria",
  "pegadinha_da_banca",
  "falta_de_atencao",
  "interpretacao",
  "chute",
  "esquecimento",
]);
export const attemptContext = pgEnum("attempt_context", [
  "avulsa",
  "revisao",
  "simulado",
  "registro_externo",
]);
export const explanationOrigin = pgEnum("explanation_origin", ["oficial", "autoral", "gerado_por_ia"]);
export const reviewStatus = pgEnum("review_status", ["ativa", "dominada"]);
export const reportStatus = pgEnum("report_status", ["aberto", "aceito", "rejeitado"]);

export const questions = pgTable(
  "questions",
  {
    id: id(),
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    type: questionType().notNull(),
    /** Opcional no cadastro rápido (questão resolvida em outra plataforma). */
    statement: text(),
    boardId: uuid().references(() => boards.id),
    organization: text(),
    year: integer(),
    subjectId: uuid().references(() => subjects.id),
    topicId: uuid().references(() => topics.id),
    difficulty: integer(),
    /** Letra (A–E) ou "C"/"E" no certo/errado. Opcional no cadastro rápido. */
    correctAnswer: text(),
    explanation: text(),
    explanationOrigin: explanationOrigin(),
    sourceUrl: text(),
    /** Plataforma de origem no cadastro rápido (só o nome; o conteúdo não é copiado). */
    externalSource: text(),
    usagePermission: text(),
    annulled: boolean().notNull().default(false),
    contentStatus: contentStatus().notNull().default("rascunho"),
    contentOrigin: contentOrigin().notNull().default("autoral"),
    isSample: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("questions_catalog_idx")
      .on(t.topicId, t.boardId, t.year)
      .where(sql`${t.ownerUserId} IS NULL`),
    index("questions_owner_idx").on(t.ownerUserId),
    check("questions_difficulty_range", sql`${t.difficulty} IS NULL OR ${t.difficulty} BETWEEN 1 AND 5`),
  ],
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: id(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    label: text().notNull(),
    text: text().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("question_options_label_unique").on(t.questionId, t.label)],
);

/** Cada tentativa é um registro novo: o histórico nunca é sobrescrito. */
export const questionAttempts = pgTable(
  "question_attempts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    answer: text(),
    isCorrect: boolean().notNull(),
    errorType: errorType(),
    timeSpentSec: integer(),
    context: attemptContext().notNull().default("avulsa"),
    mockExamAttemptId: uuid(),
    /** Evita tentativa duplicada em reenvio (duplo clique, retry de rede). */
    idempotencyKey: text().notNull(),
    answeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("question_attempts_idempotency_unique").on(t.userId, t.idempotencyKey),
    index("question_attempts_user_date_idx").on(t.userId, t.answeredAt),
    index("question_attempts_user_question_idx").on(t.userId, t.questionId),
    check("question_attempts_time_non_negative", sql`${t.timeSpentSec} IS NULL OR ${t.timeSpentSec} >= 0`),
  ],
);

export const questionNotes = pgTable(
  "question_notes",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    body: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("question_notes_unique").on(t.userId, t.questionId)],
);

export const questionLists = pgTable(
  "question_lists",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    isFavorites: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("question_lists_one_favorites")
      .on(t.userId)
      .where(sql`${t.isFavorites}`),
  ],
);

export const questionListItems = pgTable(
  "question_list_items",
  {
    listId: uuid()
      .notNull()
      .references(() => questionLists.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("question_list_items_unique").on(t.listId, t.questionId)],
);

/** Reporte de erro em questão do catálogo (fila de moderação do editor). */
export const questionReports = pgTable(
  "question_reports",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    status: reportStatus().notNull().default("aberto"),
    resolution: text(),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("question_reports_status_idx").on(t.status, t.createdAt)],
);

/** Fila de revisão espaçada (1/7/30 dias por padrão) das questões erradas. */
export const reviewItems = pgTable(
  "review_items",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    stage: integer().notNull().default(0),
    dueDate: date().notNull(),
    status: reviewStatus().notNull().default("ativa"),
    lastResult: boolean(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_items_unique").on(t.userId, t.questionId),
    index("review_items_due_idx").on(t.userId, t.status, t.dueDate),
  ],
);
