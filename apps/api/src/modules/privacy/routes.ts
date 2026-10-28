import type { Database } from "@aprovaai/db";
import { apiErrorSchema, deleteAccountSchema } from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth, requireUser } from "../../plugins/auth-context";
import { PrivacyService } from "./service";

const SESSION_COOKIES = ["aprovaai.session_token", "__Secure-aprovaai.session_token"];

export function registerPrivacyRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const service = new PrivacyService(db);

  r.get(
    "/api/me/export",
    { preHandler: requireAuth, schema: { tags: ["me"], hide: true } },
    async (request, reply) => {
      const user = requireUser(request);
      const data = await service.export(user);
      await service.recordExport(user, request.clientIp);
      const date = new Date().toISOString().slice(0, 10);
      return reply
        .header("content-type", "application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="aprovaai-meus-dados-${date}.json"`)
        .header("cache-control", "no-store")
        .send(JSON.stringify(data, null, 2));
    },
  );

  r.delete(
    "/api/me",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["me"],
        body: deleteAccountSchema,
        response: { 204: z.null(), 400: apiErrorSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      await service.deleteAccount(requireUser(request), request.body);
      // As sessões já foram apagadas junto com a conta; limpa o cookie do navegador também.
      reply.header(
        "set-cookie",
        SESSION_COOKIES.map((name) => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`),
      );
      return reply.status(204).send(null);
    },
  );
}
