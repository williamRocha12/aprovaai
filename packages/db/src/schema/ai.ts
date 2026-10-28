// IA: registro de cada chamada (tokens/custo/status) e cache de explicações geradas.
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { users } from "./auth";
import { questions } from "./questions";

export const aiFeature = pgEnum("ai_feature", [
  "notice_extract",
  "question_classify",
  "question_explain",
  "plan_summary",
]);
export const aiStatus = pgEnum("ai_status", ["ok", "error", "refused", "invalid_output"]);

/** Uma linha por chamada ao provedor. Não guarda conteúdo (nem prompt nem resposta): só metadados de uso. */
export const aiInteractions = pgTable(
  "ai_interactions",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    feature: aiFeature().notNull(),
    model: text().notNull(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 10, scale: 6, mode: "number" }),
    status: aiStatus().notNull(),
    errorCode: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_interactions_user_idx").on(t.userId, t.createdAt)],
);

/** Explicação gerada por IA, compartilhada por questão (evita pagar de novo). Sempre exibida como "gerado por IA". */
export const aiExplanations = pgTable(
  "ai_explanations",
  {
    id: id(),
    questionId: uuid()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    body: text().notNull(),
    model: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ai_explanations_question_unique").on(t.questionId)],
);
