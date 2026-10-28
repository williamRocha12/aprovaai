// Fila de jobs no Postgres (ADR-010): processada em lotes pelo Vercel Cron ou pelo "rodar agora" do admin.
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

export const jobStatus = pgEnum("job_status", ["pendente", "executando", "concluido", "falhou"]);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatus().notNull().default("pendente"),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(3),
    runAfter: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Idempotência: o mesmo trabalho (ex.: processar a prova X) não é enfileirado duas vezes. */
    dedupeKey: text(),
    lockedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    finishedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("jobs_queue_idx").on(t.status, t.runAfter),
    uniqueIndex("jobs_dedupe_unique")
      .on(t.dedupeKey)
      .where(sql`${t.dedupeKey} IS NOT NULL`),
  ],
);
