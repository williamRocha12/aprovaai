// Fila de jobs no Postgres (ADR-010). Cada execução pega um job por vez com FOR UPDATE SKIP LOCKED,
// respeita um orçamento de tempo (função serverless tem limite) e refaz com backoff exponencial.
import { jobs, type Database } from "@aprovaai/db";
import { eq, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";

export type JobRow = typeof jobs.$inferSelect;
export type JobHandler = (job: JobRow) => Promise<void>;

/** Job "executando" há mais que isso é considerado travado (a função caiu) e volta para a fila. */
const STALE_LOCK_MINUTES = 10;

export interface EnqueueOptions {
  dedupeKey?: string;
  runAfter?: Date;
  maxAttempts?: number;
}

/** Enfileira; com dedupeKey repetida não cria outro (idempotente). Devolve o id do job existente ou novo. */
export async function enqueueJob(
  db: Database,
  type: string,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<string> {
  const [created] = await db
    .insert(jobs)
    .values({
      type,
      payload,
      dedupeKey: options.dedupeKey ?? null,
      runAfter: options.runAfter ?? new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    })
    .onConflictDoNothing()
    .returning({ id: jobs.id });
  if (created) return created.id;
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.dedupeKey, options.dedupeKey ?? ""));
  return existing?.id ?? "";
}

async function claimNext(db: Database): Promise<JobRow | null> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    update ${jobs} set status = 'executando', locked_at = now(), attempts = attempts + 1, updated_at = now()
    where id = (
      select id from ${jobs}
      where (status = 'pendente' and run_after <= now())
         or (status = 'executando' and locked_at < now() - (${STALE_LOCK_MINUTES} || ' minutes')::interval)
      order by run_after
      limit 1
      for update skip locked
    )
    returning id
  `);
  const id = [...rows][0]?.id as string | undefined;
  if (!id) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return job ?? null;
}

export interface RunSummary {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
}

export async function runJobs(
  db: Database,
  handlers: Record<string, JobHandler>,
  logger: FastifyBaseLogger,
  options: { budgetMs: number; maxJobs?: number },
): Promise<RunSummary> {
  const started = Date.now();
  const summary: RunSummary = { processed: 0, succeeded: 0, retried: 0, failed: 0 };
  while (Date.now() - started < options.budgetMs && summary.processed < (options.maxJobs ?? 100)) {
    const job = await claimNext(db);
    if (!job) break;
    summary.processed++;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Tipo de job desconhecido: ${job.type}`);
      await handler(job);
      await db
        .update(jobs)
        .set({ status: "concluido", finishedAt: new Date(), lastError: null })
        .where(eq(jobs.id, job.id));
      summary.succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const final = job.attempts >= job.maxAttempts;
      // Backoff exponencial: 2, 4, 8... minutos.
      const runAfter = new Date(Date.now() + 2 ** job.attempts * 60_000);
      await db
        .update(jobs)
        .set({
          status: final ? "falhou" : "pendente",
          lastError: message.slice(0, 2000),
          runAfter,
          finishedAt: final ? new Date() : null,
        })
        .where(eq(jobs.id, job.id));
      logger.warn({ jobId: job.id, type: job.type, attempts: job.attempts, final }, "job falhou");
      if (final) summary.failed++;
      else summary.retried++;
    }
  }
  return summary;
}
