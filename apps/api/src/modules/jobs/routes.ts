// Execução da fila: Vercel Cron (GET com "Authorization: Bearer $CRON_SECRET") e "rodar agora" no admin.
import { timingSafeEqual } from "node:crypto";
import { jobs, type Database } from "@aprovaai/db";
import { apiErrorSchema } from "@aprovaai/shared";
import { desc, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../../config";
import { AppError } from "../../lib/errors";
import { enqueueJob, type RunSummary } from "../../lib/jobs";
import { requireRole } from "../../plugins/auth-context";

const summarySchema = z.object({
  processed: z.number(),
  succeeded: z.number(),
  retried: z.number(),
  failed: z.number(),
});

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerJobRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
  run: (budgetMs: number) => Promise<RunSummary>,
  /** O que o cron diário enfileira além da manutenção (ex.: coleta do radar). */
  cronHooks: ((day: string) => Promise<void>)[] = [],
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/api/cron/jobs",
    { schema: { hide: true, response: { 200: summarySchema, 401: apiErrorSchema, 404: apiErrorSchema } } },
    async (request) => {
      if (!config.CRON_SECRET) throw new AppError(404, "NOT_FOUND", "Cron não configurado.");
      const header = request.headers.authorization ?? "";
      if (!safeEqual(header, `Bearer ${config.CRON_SECRET}`))
        throw new AppError(401, "UNAUTHENTICATED", "Não autorizado.");
      // Manutenção diária (idempotente por data) + tarefas agendadas dos módulos.
      const day = new Date().toISOString().slice(0, 10);
      await enqueueJob(db, "maintenance_cleanup", {}, { dedupeKey: `maintenance:${day}` });
      for (const hook of cronHooks) await hook(day);
      return run(240_000);
    },
  );

  r.post(
    "/api/admin/jobs/run",
    {
      preHandler: requireRole("admin"),
      schema: {
        tags: ["admin"],
        response: { 200: summarySchema, ...{ 401: apiErrorSchema, 403: apiErrorSchema } },
      },
    },
    async () => run(50_000),
  );

  r.get(
    "/api/admin/jobs",
    {
      preHandler: requireRole("admin"),
      schema: {
        tags: ["admin"],
        response: {
          200: z.object({
            counts: z.record(z.string(), z.number()),
            recent: z.array(
              z.object({
                id: z.uuid(),
                type: z.string(),
                status: z.string(),
                attempts: z.number(),
                lastError: z.string().nullable(),
                runAfter: z.string(),
                updatedAt: z.string(),
              }),
            ),
          }),
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async () => {
      const counts = await db
        .select({ status: jobs.status, value: sql<number>`count(*)::int` })
        .from(jobs)
        .groupBy(jobs.status);
      const recent = await db.select().from(jobs).orderBy(desc(jobs.updatedAt)).limit(50);
      return {
        counts: Object.fromEntries(counts.map((c) => [c.status, c.value])),
        recent: recent.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          attempts: j.attempts,
          lastError: j.lastError,
          runAfter: j.runAfter.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
        })),
      };
    },
  );
}
