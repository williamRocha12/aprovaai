import type { Database } from "@aprovaai/db";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export function registerHealthRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Liveness: o processo está de pé.
  r.get(
    "/api/health",
    { schema: { tags: ["health"], response: { 200: z.object({ status: z.literal("ok") }) } } },
    async () => ({ status: "ok" as const }),
  );

  // Readiness: o banco responde.
  r.get(
    "/api/ready",
    {
      schema: {
        tags: ["health"],
        response: {
          200: z.object({ status: z.literal("ready") }),
          503: z.object({ status: z.literal("unavailable") }),
        },
      },
    },
    async (request, reply) => {
      try {
        await db.execute(sql`select 1`);
        return { status: "ready" as const };
      } catch (err) {
        request.log.error({ err }, "readiness falhou: banco indisponível");
        return reply.status(503).send({ status: "unavailable" as const });
      }
    },
  );
}
