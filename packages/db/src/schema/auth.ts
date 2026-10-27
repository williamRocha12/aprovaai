// Tabelas usadas pelo Better Auth (user, session, account, verification, rateLimit)
// + colunas próprias do AprovaAI (role, status, timezone, deleted_at).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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

export const userRole = pgEnum("user_role", ["user", "editor", "admin"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    role: userRole().notNull().default("user"),
    status: userStatus().notNull().default("active"),
    timezone: text().notNull().default("America/Sao_Paulo"),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  // E-mail único sem diferenciar maiúsculas/minúsculas.
  (t) => [uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    ...timestamps,
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    /** Hash Argon2id (nunca a senha). */
    password: text(),
    ...timestamps,
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_account_unique").on(t.providerId, t.accountId),
  ],
);

/** Tokens de verificação de e-mail e redefinição de senha (uso único, com expiração). */
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Contadores de rate limit do Better Auth (por IP + rota). */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/**
 * Bloqueio temporário após falhas de login, por e-mail (hash).
 * Vale também para e-mails que não existem, para não revelar quais contas existem.
 */
export const loginAttempts = pgTable("login_attempts", {
  emailHash: text().primaryKey(),
  failedCount: integer().notNull().default(0),
  lockedUntil: timestamp({ withTimezone: true }),
  lastFailedAt: timestamp({ withTimezone: true }),
});
