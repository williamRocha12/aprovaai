import { importNotice, type Database } from "@aprovaai/db";
import {
  apiErrorSchema,
  catalogListQuerySchema,
  examDetailSchema,
  examSummarySchema,
  noticeImportSchema,
  paginatedSchema,
  updateExamStatusSchema,
} from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import { AppError, notFound } from "../../lib/errors";
import { requireAuth, requireRole, requireUser } from "../../plugins/auth-context";
import { CatalogRepository } from "./repository";

const idParams = z.object({ id: z.uuid() });
const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};

const importBodySchema = z.object({
  data: noticeImportSchema,
  /** Só editor/admin pode publicar no catálogo; usuário comum sempre cria um concurso privado. */
  target: z.enum(["catalog", "private"]).default("private"),
  publish: z.boolean().default(false),
  /** Editor: adiciona o conteúdo programático a um concurso do catálogo que ainda não tem edital. */
  examId: z.uuid().optional(),
});

export function registerCatalogRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const repo = new CatalogRepository(db);

  r.get(
    "/api/catalog/exams",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["catalog"],
        querystring: catalogListQuerySchema,
        response: { 200: paginatedSchema(examSummarySchema), ...errors },
      },
    },
    async (request) => {
      const { items, total } = await repo.list(requireUser(request), request.query);
      return { items, total, page: request.query.page, pageSize: request.query.pageSize };
    },
  );

  r.get(
    "/api/catalog/boards",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["catalog"],
        response: { 200: z.array(z.object({ slug: z.string(), name: z.string() })) },
      },
    },
    async () => repo.listBoards(),
  );

  r.get(
    "/api/catalog/exams/:id",
    {
      preHandler: requireAuth,
      schema: { tags: ["catalog"], params: idParams, response: { 200: examDetailSchema, ...errors } },
    },
    async (request) => {
      const detail = await repo.detail(requireUser(request), request.params.id);
      if (!detail) throw notFound("Concurso não encontrado.");
      return detail;
    },
  );

  r.post(
    "/api/catalog/import",
    {
      preHandler: requireAuth,
      bodyLimit: 2 * 1_048_576,
      schema: {
        tags: ["catalog"],
        body: importBodySchema,
        response: {
          201: z.object({
            examId: z.uuid(),
            noticeId: z.uuid(),
            subjects: z.number(),
            topics: z.number(),
            target: z.string(),
          }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const isEditor = user.role === "editor" || user.role === "admin";
      const toCatalog = request.body.target === "catalog" && isEditor;
      if (request.body.examId) {
        if (!toCatalog) throw new AppError(403, "FORBIDDEN", "Só editores completam concursos do catálogo.");
        const existing = await repo.findCatalogExam(request.body.examId);
        if (!existing) throw notFound("Concurso não encontrado no catálogo.");
        if (await repo.hasNotice(existing.id)) {
          throw new AppError(409, "CONFLICT", "Este concurso já tem conteúdo programático.");
        }
      }
      const result = await importNotice(db, request.body.data, {
        ownerUserId: toCatalog ? null : user.id,
        contentStatus: toCatalog ? (request.body.publish ? "validado" : "rascunho") : "validado",
        contentOrigin: toCatalog ? "oficial" : "usuario",
        ...(request.body.examId ? { existingExamId: request.body.examId } : {}),
      });
      if (toCatalog) {
        await recordAudit(db, {
          action: request.body.examId ? AUDIT_ACTIONS.NOTICE_CONTENT_ADDED : AUDIT_ACTIONS.CATALOG_IMPORTED,
          actorUserId: user.id,
          targetType: "exam",
          targetId: result.examId,
          metadata: { subjects: result.subjects, topics: result.topics, published: request.body.publish },
          ipAddress: request.clientIp,
        });
      }
      return reply.status(201).send({ ...result, target: toCatalog ? "catalog" : "private" });
    },
  );

  r.patch(
    "/api/catalog/exams/:id",
    {
      preHandler: requireRole("editor", "admin"),
      schema: {
        tags: ["catalog"],
        params: idParams,
        body: updateExamStatusSchema,
        response: { 200: examDetailSchema, ...errors },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const exam = await repo.findCatalogExam(request.params.id);
      if (!exam) throw notFound("Concurso não encontrado no catálogo.");
      const changes = { ...request.body, lastVerifiedAt: new Date() };
      await repo.updateExam(exam.id, changes);
      await recordAudit(db, {
        action: AUDIT_ACTIONS.CATALOG_EDITED,
        actorUserId: user.id,
        targetType: "exam",
        targetId: exam.id,
        metadata: { fields: Object.keys(request.body) },
        ipAddress: request.clientIp,
      });
      const detail = await repo.detail(user, exam.id);
      if (!detail) throw notFound();
      return detail;
    },
  );
}
