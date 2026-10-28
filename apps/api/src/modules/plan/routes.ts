import type { Database } from "@aprovaai/db";
import {
  apiErrorSchema,
  cycleSchema,
  goalInputSchema,
  goalSchema,
  planMessageSchema,
  sessionInputSchema,
  sessionSchema,
  sessionsQuerySchema,
  taskSchema,
  updateTaskSchema,
} from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notFound } from "../../lib/errors";
import { requireAuth, requireUser } from "../../plugins/auth-context";
import type { PlanService } from "./service";

const idParams = z.object({ id: z.uuid() });
const errors = { 400: apiErrorSchema, 401: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema };
const planStateSchema = z.object({ cycle: cycleSchema.nullable(), issues: z.array(planMessageSchema) });

export function registerPlanRoutes(app: FastifyInstance, _db: Database, service: PlanService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const opts = { preHandler: requireAuth };

  r.get(
    "/api/goal",
    { ...opts, schema: { tags: ["plan"], response: { 200: goalSchema, ...errors } } },
    async (request) => {
      const goal = await service.goal(requireUser(request));
      if (!goal) throw notFound("Você ainda não configurou um concurso-alvo.");
      return goal;
    },
  );

  // Cria o objetivo (onboarding) ou atualiza as configurações. Sempre recalcula o ciclo.
  r.put(
    "/api/goal",
    {
      ...opts,
      schema: { tags: ["plan"], body: goalInputSchema, response: { 200: planStateSchema, ...errors } },
    },
    async (request) => service.saveGoal(requireUser(request), request.body),
  );

  r.get(
    "/api/plan/current",
    { ...opts, schema: { tags: ["plan"], response: { 200: planStateSchema, ...errors } } },
    async (request) => service.current(requireUser(request)),
  );

  r.post(
    "/api/plan/recalculate",
    { ...opts, schema: { tags: ["plan"], response: { 200: planStateSchema, ...errors } } },
    async (request) => service.regenerate(requireUser(request), "replace"),
  );

  r.patch(
    "/api/tasks/:id",
    {
      ...opts,
      schema: {
        tags: ["plan"],
        params: idParams,
        body: updateTaskSchema,
        response: { 200: taskSchema, ...errors },
      },
    },
    async (request) => service.updateTask(requireUser(request), request.params.id, request.body),
  );

  r.get(
    "/api/sessions",
    {
      ...opts,
      schema: {
        tags: ["plan"],
        querystring: sessionsQuerySchema,
        response: { 200: z.array(sessionSchema), ...errors },
      },
    },
    async (request) => service.listSessions(requireUser(request), request.query.from, request.query.to),
  );

  r.post(
    "/api/sessions",
    {
      ...opts,
      schema: { tags: ["plan"], body: sessionInputSchema, response: { 201: sessionSchema, ...errors } },
    },
    async (request, reply) =>
      reply.status(201).send(await service.createSession(requireUser(request), request.body)),
  );

  r.delete(
    "/api/sessions/:id",
    { ...opts, schema: { tags: ["plan"], params: idParams, response: { 204: z.null(), ...errors } } },
    async (request, reply) => {
      await service.deleteSession(requireUser(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
}
