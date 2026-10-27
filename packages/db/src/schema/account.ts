// Perfil, consentimentos (LGPD), auditoria e feature flags.
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./auth";

export const educationLevel = pgEnum("education_level", ["fundamental", "medio", "superior"]);
export const consentDocument = pgEnum("consent_document", ["terms", "privacy", "analytics"]);

/** Minutos disponíveis por dia da semana (chave = dia, "0" = domingo). */
export type WeeklyAvailability = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", number>;

export const userProfiles = pgTable("user_profiles", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text(),
  educationLevel: educationLevel(),
  interestAreas: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Disponibilidade padrão, usada como sugestão no onboarding. */
  weeklyAvailability: jsonb().$type<WeeklyAvailability>(),
  studyPreferences: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    document: consentDocument().notNull(),
    version: text().notNull(),
    accepted: boolean().notNull(),
    ipAddress: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_user_id_idx").on(t.userId, t.document)],
);

/**
 * Trilha de auditoria de ações sensíveis. `actor_user_id` vira NULL na exclusão de conta
 * (anonimização). Metadados nunca levam senha, token ou PII desnecessária.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorUserId, t.createdAt),
    index("audit_logs_action_idx").on(t.action, t.createdAt),
  ],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text().primaryKey(),
    enabled: boolean().notNull().default(false),
    description: text().notNull(),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [check("feature_flags_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]*$'`)],
);
