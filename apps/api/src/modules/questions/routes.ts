import type { Database } from "@aprovaai/db";
import {
  ERROR_TYPES,
  REVIEW_BUCKETS,
  apiErrorSchema,
  attemptDtoSchema,
  attemptInputSchema,
  attemptResultSchema,
  classifyAttemptSchema,
  dashboardSchema,
  errorNotebookResponseSchema,
  listInputSchema,
  noteInputSchema,
  paginatedSchema,
  personalQuestionSchema,
  questionDetailSchema,
  questionFiltersSchema,
  questionListSchema,
  questionSummarySchema,
  quickRegisterSchema,
  reportInputSchema,
  reviewsResponseSchema,
} from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { notFound } from "../../lib/errors";
import { requireAuth, requireUser } from "../../plugins/auth-context";
import type { DashboardService } from "../dashboard/service";
import type { PlanService } from "../plan/service";
import type { QuestionsService } from "./service";

const idParams = z.object({ id: z.uuid() });
const errors = { 400: apiErrorSchema, 401: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema };

export function registerQuestionRoutes(
  app: FastifyInstance,
  _db: Database,
  service: QuestionsService,
  plan: PlanService,
  dashboard: DashboardService,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const opts = { preHandler: requireAuth };
  const tags = ["questions"];

  r.get(
    "/api/questions",
    {
      ...opts,
      schema: {
        tags,
        querystring: questionFiltersSchema,
        response: { 200: paginatedSchema(questionSummarySchema), ...errors },
      },
    },
    async (request) => {
      const { items, total } = await service.list(requireUser(request), request.query);
      return { items, total, page: request.query.page, pageSize: request.query.pageSize };
    },
  );

  r.get(
    "/api/questions/next",
    {
      ...opts,
      schema: {
        tags,
        querystring: questionFiltersSchema.extend({ exclude: z.uuid().optional() }),
        response: { 200: z.object({ id: z.uuid().nullable() }), ...errors },
      },
    },
    async (request) => ({
      id: await service.next(requireUser(request), request.query, request.query.exclude),
    }),
  );

  r.get(
    "/api/questions/:id",
    { ...opts, schema: { tags, params: idParams, response: { 200: questionDetailSchema, ...errors } } },
    async (request) => service.detail(requireUser(request), request.params.id),
  );

  r.post(
    "/api/questions",
    {
      ...opts,
      schema: {
        tags,
        body: personalQuestionSchema,
        response: { 201: z.object({ id: z.uuid() }), ...errors },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await service.createPersonal(requireUser(request), request.body)),
  );

  r.post(
    "/api/questions/quick",
    {
      ...opts,
      schema: {
        tags,
        body: quickRegisterSchema,
        response: {
          201: z.object({
            questionId: z.uuid(),
            attempt: attemptDtoSchema,
            review: attemptResultSchema.shape.review,
          }),
          ...errors,
        },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await service.quickRegister(requireUser(request), request.body)),
  );

  r.post(
    "/api/questions/:id/attempts",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: attemptInputSchema,
        response: { 200: attemptResultSchema, ...errors },
      },
    },
    async (request) => service.attempt(requireUser(request), request.params.id, request.body),
  );

  r.patch(
    "/api/attempts/:id",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: classifyAttemptSchema,
        response: { 200: attemptDtoSchema, ...errors },
      },
    },
    async (request) => service.classify(requireUser(request), request.params.id, request.body.errorType),
  );

  r.patch(
    "/api/questions/:id/taxonomy",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: z.object({ subjectId: z.uuid().nullable(), topicId: z.uuid().nullable() }),
        response: { 200: questionDetailSchema, ...errors },
      },
    },
    async (request) =>
      service.setTaxonomy(
        requireUser(request),
        request.params.id,
        request.body.subjectId,
        request.body.topicId,
      ),
  );

  r.put(
    "/api/questions/:id/note",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: noteInputSchema,
        response: { 200: z.object({ note: z.string().nullable() }), ...errors },
      },
    },
    async (request) => service.saveNote(requireUser(request), request.params.id, request.body.body),
  );

  r.post(
    "/api/questions/:id/favorite",
    {
      ...opts,
      schema: { tags, params: idParams, response: { 200: z.object({ isFavorite: z.boolean() }), ...errors } },
    },
    async (request) => service.toggleFavorite(requireUser(request), request.params.id),
  );

  r.post(
    "/api/questions/:id/reports",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: reportInputSchema,
        response: { 201: z.object({ id: z.uuid() }), ...errors },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await service.report(requireUser(request), request.params.id, request.body.reason)),
  );

  // --- Listas ---
  r.get(
    "/api/lists",
    { ...opts, schema: { tags, response: { 200: z.array(questionListSchema) } } },
    async (request) => service.lists(requireUser(request)),
  );
  r.post(
    "/api/lists",
    { ...opts, schema: { tags, body: listInputSchema, response: { 201: questionListSchema, ...errors } } },
    async (request, reply) =>
      reply.status(201).send(await service.createList(requireUser(request), request.body.name)),
  );
  r.delete(
    "/api/lists/:id",
    { ...opts, schema: { tags, params: idParams, response: { 204: z.null(), ...errors } } },
    async (request, reply) => {
      await service.deleteList(requireUser(request), request.params.id);
      return reply.status(204).send(null);
    },
  );
  r.post(
    "/api/lists/:id/items",
    {
      ...opts,
      schema: {
        tags,
        params: idParams,
        body: z.object({ questionId: z.uuid() }),
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await service.addToList(requireUser(request), request.params.id, request.body.questionId);
      return reply.status(204).send(null);
    },
  );
  r.delete(
    "/api/lists/:id/items/:questionId",
    {
      ...opts,
      schema: {
        tags,
        params: z.object({ id: z.uuid(), questionId: z.uuid() }),
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await service.removeFromList(requireUser(request), request.params.id, request.params.questionId);
      return reply.status(204).send(null);
    },
  );

  // --- Revisões e caderno de erros ---
  r.get(
    "/api/reviews",
    {
      ...opts,
      schema: {
        tags,
        querystring: z.object({ bucket: z.enum(REVIEW_BUCKETS).optional() }),
        response: { 200: reviewsResponseSchema, ...errors },
      },
    },
    async (request) => service.reviews(requireUser(request), request.query.bucket),
  );

  r.get(
    "/api/error-notebook",
    {
      ...opts,
      schema: {
        tags,
        querystring: z.object({ subjectId: z.uuid().optional(), errorType: z.enum(ERROR_TYPES).optional() }),
        response: { 200: errorNotebookResponseSchema, ...errors },
      },
    },
    async (request) => service.errorNotebook(requireUser(request), request.query),
  );

  // --- Dashboard e assuntos do plano (para filtros e cadastro) ---
  r.get(
    "/api/dashboard",
    { ...opts, schema: { tags: ["dashboard"], response: { 200: dashboardSchema, ...errors } } },
    async (request) => dashboard.get(requireUser(request)),
  );

  r.get(
    "/api/goal/topics",
    {
      ...opts,
      schema: {
        tags: ["plan"],
        response: {
          200: z.array(
            z.object({
              subjectId: z.uuid(),
              subjectName: z.string(),
              topicId: z.uuid(),
              topicName: z.string(),
              noticeTopicId: z.uuid(),
            }),
          ),
          ...errors,
        },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const goal = await plan.repo.activeGoal(user.id);
      if (!goal) throw notFound("Você ainda não configurou um concurso-alvo.");
      const states = await plan.repo.topicStates(user.id, goal.id);
      return states.map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        topicId: s.topicId,
        topicName: s.topicName,
        noticeTopicId: s.noticeTopicId,
      }));
    },
  );
}
