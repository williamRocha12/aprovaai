import type { Database } from "@aprovaai/db";
import { apiErrorSchema, meResponseSchema, updateProfileSchema } from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { notFound } from "../../lib/errors";
import { requireAuth, requireUser } from "../../plugins/auth-context";
import { MeRepository } from "./repository";

export function registerMeRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const repo = new MeRepository(db);

  r.get(
    "/api/me",
    {
      preHandler: requireAuth,
      schema: { tags: ["me"], response: { 200: meResponseSchema, 401: apiErrorSchema } },
    },
    async (request) => {
      const me = await repo.findMe(requireUser(request).id);
      if (!me) throw notFound();
      return me;
    },
  );

  r.patch(
    "/api/me/profile",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["me"],
        body: updateProfileSchema,
        response: { 200: meResponseSchema, 400: apiErrorSchema, 401: apiErrorSchema },
      },
    },
    async (request) => {
      const { id } = requireUser(request);
      await repo.updateProfile(id, request.body);
      const me = await repo.findMe(id);
      if (!me) throw notFound();
      return me;
    },
  );
}
