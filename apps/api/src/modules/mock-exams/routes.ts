import type { Database } from "@aprovaai/db";
import {
  apiErrorSchema,
  createMockExamSchema,
  finishMockExamSchema,
  mockExamResultSchema,
  mockExamSessionSchema,
  mockExamSummarySchema,
} from "@aprovaai/shared";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { assertFlag } from "../../lib/feature-flags";
import { requireAuth, requireUser } from "../../plugins/auth-context";
import type { MockExamsService } from "./service";

const idParams = z.object({ id: z.uuid() });
const errors = { 400: apiErrorSchema, 401: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema };

export function registerMockExamRoutes(app: FastifyInstance, db: Database, service: MockExamsService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  // Simulados ficam atrás da feature flag "mock_exams".
  const enabled: preHandlerAsyncHookHandler = async () => assertFlag(db, "mock_exams", "Simulado");
  const opts = { preHandler: [requireAuth, enabled] };
  const tags = ["mock-exams"];

  r.get(
    "/api/mock-exams",
    { ...opts, schema: { tags, response: { 200: z.array(mockExamSummarySchema), ...errors } } },
    async (request) => service.list(requireUser(request)),
  );

  r.post(
    "/api/mock-exams",
    {
      ...opts,
      schema: {
        tags,
        body: createMockExamSchema,
        response: { 201: z.object({ id: z.uuid(), questionCount: z.number() }), ...errors },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await service.create(requireUser(request), request.body)),
  );

  r.post(
    "/api/mock-exams/:id/start",
    { ...opts, schema: { tags, params: idParams, response: { 200: mockExamSessionSchema, ...errors } } },
    async (request) => service.start(requireUser(request), request.params.id),
  );

  r.get(
    "/api/mock-exam-attempts/:id/session",
    { ...opts, schema: { tags, params: idParams, response: { 200: mockExamSessionSchema, ...errors } } },
    async (request) => service.session(requireUser(request), request.params.id),
  );

  r.post(
    "/api/mock-exam-attempts/:id/finish",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: finishMockExamSchema,
        response: { 200: mockExamResultSchema, ...errors },
      },
    },
    async (request) => service.finish(requireUser(request), request.params.id, request.body.answers),
  );

  r.get(
    "/api/mock-exam-attempts/:id/result",
    { ...opts, schema: { tags, params: idParams, response: { 200: mockExamResultSchema, ...errors } } },
    async (request) => service.result(requireUser(request), request.params.id),
  );
}
