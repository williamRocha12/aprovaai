import {
  apiErrorSchema,
  boardXraySchema,
  pastExamDetailSchema,
  pastExamImportSchema,
  pastExamSummarySchema,
  reviewPastExamItemSchema,
} from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import type { Database } from "@aprovaai/db";
import { enqueueJob } from "../../lib/jobs";
import { requireAuth, requireRole, requireUser } from "../../plugins/auth-context";
import type { PastExamsService } from "./service";

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const idParams = z.object({ id: z.uuid() });

export function registerPastExamRoutes(
  app: FastifyInstance,
  db: Database,
  service: PastExamsService,
  runNow: () => Promise<unknown>,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const editors = requireRole("editor", "admin");
  const tags = ["past-exams"];

  r.get(
    "/api/past-exams",
    {
      preHandler: requireAuth,
      schema: {
        tags,
        querystring: z.object({
          board: z.string().max(50).optional(),
          organization: z.string().max(100).optional(),
          position: z.string().max(100).optional(),
          area: z.string().max(100).optional(),
          year: z.coerce.number().int().optional(),
        }),
        response: { 200: z.array(pastExamSummarySchema), ...errors },
      },
    },
    async (request) => service.list(requireUser(request), request.query),
  );

  r.get(
    "/api/past-exams/:id",
    {
      preHandler: requireAuth,
      schema: { tags, params: idParams, response: { 200: pastExamDetailSchema, ...errors } },
    },
    async (request) => service.detail(requireUser(request), request.params.id),
  );

  r.post(
    "/api/past-exams",
    {
      preHandler: editors,
      bodyLimit: 3 * 1_048_576,
      schema: { tags, body: pastExamImportSchema, response: { 201: pastExamDetailSchema, ...errors } },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = await service.create(user, request.body);
      await recordAudit(db, {
        action: AUDIT_ACTIONS.PAST_EXAM_IMPORTED,
        actorUserId: user.id,
        targetType: "past_exam",
        targetId: id,
        ipAddress: request.clientIp,
      });
      // Enfileira (idempotente) e já processa um lote: o editor vê o resultado sem esperar o cron.
      await enqueueJob(db, "process_past_exam", { pastExamId: id }, { dedupeKey: `process_past_exam:${id}` });
      await runNow();
      return reply.status(201).send(await service.detail(user, id));
    },
  );

  r.patch(
    "/api/past-exams/:id/items/:itemId",
    {
      preHandler: editors,
      schema: {
        tags,
        params: z.object({ id: z.uuid(), itemId: z.uuid() }),
        body: reviewPastExamItemSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await service.reviewItem(requireUser(request), request.params.id, request.params.itemId, request.body);
      return reply.status(204).send(null);
    },
  );

  r.post(
    "/api/past-exams/:id/finish-review",
    {
      preHandler: editors,
      schema: { tags, params: idParams, response: { 200: pastExamDetailSchema, ...errors } },
    },
    async (request) => {
      const user = requireUser(request);
      await service.finishReview(request.params.id);
      await recordAudit(db, {
        action: AUDIT_ACTIONS.PAST_EXAM_REVIEWED,
        actorUserId: user.id,
        targetType: "past_exam",
        targetId: request.params.id,
        ipAddress: request.clientIp,
      });
      return service.detail(user, request.params.id);
    },
  );

  r.post(
    "/api/past-exams/:id/publish",
    {
      preHandler: editors,
      schema: { tags, params: idParams, response: { 200: z.object({ published: z.number() }), ...errors } },
    },
    async (request) => {
      const result = await service.publish(request.params.id);
      await recordAudit(db, {
        action: AUDIT_ACTIONS.PAST_EXAM_PUBLISHED,
        actorUserId: requireUser(request).id,
        targetType: "past_exam",
        targetId: request.params.id,
        metadata: result,
        ipAddress: request.clientIp,
      });
      return result;
    },
  );

  r.get(
    "/api/board-xray/boards",
    {
      preHandler: requireAuth,
      schema: {
        tags,
        response: {
          200: z.array(z.object({ slug: z.string(), name: z.string(), exams: z.number() })),
          ...errors,
        },
      },
    },
    async () => service.boardsWithData(),
  );

  r.get(
    "/api/board-xray/:board",
    {
      preHandler: requireAuth,
      schema: {
        tags,
        params: z.object({ board: z.string().max(50) }),
        querystring: z.object({
          organization: z.string().max(100).optional(),
          area: z.string().max(100).optional(),
        }),
        response: { 200: boardXraySchema, ...errors },
      },
    },
    async (request) => service.xray(request.params.board, request.query),
  );
}
