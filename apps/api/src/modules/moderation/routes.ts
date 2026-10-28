// Moderação do catálogo (editor/admin): reportes de erro e correção de questões. Tudo auditado.
import { questionReports, questions, type Database } from "@aprovaai/db";
import {
  REPORT_STATUSES,
  apiErrorSchema,
  editorQuestionPatchSchema,
  questionReportSchema,
  resolveReportSchema,
} from "@aprovaai/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import { conflict, notFound } from "../../lib/errors";
import { requireRole, requireUser } from "../../plugins/auth-context";

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const preview = (text: string | null) => (text && text.length > 200 ? `${text.slice(0, 200)}…` : text);

export function registerModerationRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const editors = requireRole("editor", "admin");

  r.get(
    "/api/moderation/reports",
    {
      preHandler: editors,
      schema: {
        tags: ["moderation"],
        querystring: z.object({ status: z.enum(REPORT_STATUSES).default("aberto") }),
        response: { 200: z.array(questionReportSchema), ...errors },
      },
    },
    async (request) => {
      const rows = await db
        .select({
          report: questionReports,
          statement: questions.statement,
          correctAnswer: questions.correctAnswer,
          annulled: questions.annulled,
        })
        .from(questionReports)
        .innerJoin(questions, eq(questions.id, questionReports.questionId))
        .where(eq(questionReports.status, request.query.status))
        .orderBy(desc(questionReports.createdAt))
        .limit(200);
      // O reporte não expõe quem reportou: o editor só precisa do conteúdo.
      return rows.map(({ report, statement, correctAnswer, annulled }) => ({
        id: report.id,
        questionId: report.questionId,
        statementPreview: preview(statement),
        correctAnswer,
        reason: report.reason,
        status: report.status,
        resolution: report.resolution,
        createdAt: report.createdAt.toISOString(),
        annulled,
      }));
    },
  );

  r.patch(
    "/api/moderation/reports/:id",
    {
      preHandler: editors,
      schema: {
        tags: ["moderation"],
        params: z.object({ id: z.uuid() }),
        body: resolveReportSchema,
        response: { 200: questionReportSchema, ...errors },
      },
    },
    async (request) => {
      const actor = requireUser(request);
      const [report] = await db
        .select()
        .from(questionReports)
        .where(eq(questionReports.id, request.params.id));
      if (!report) throw notFound("Reporte não encontrado.");
      if (report.status !== "aberto") throw conflict("Este reporte já foi resolvido.");
      const [updated] = await db
        .update(questionReports)
        .set({
          status: request.body.status,
          resolution: request.body.resolution,
          resolvedBy: actor.id,
          resolvedAt: new Date(),
        })
        .where(eq(questionReports.id, report.id))
        .returning();
      await recordAudit(db, {
        action: AUDIT_ACTIONS.REPORT_RESOLVED,
        actorUserId: actor.id,
        targetType: "question_report",
        targetId: report.id,
        metadata: { status: request.body.status, questionId: report.questionId },
        ipAddress: request.clientIp,
      });
      const [question] = await db.select().from(questions).where(eq(questions.id, report.questionId));
      if (!updated || !question) throw notFound();
      return {
        id: updated.id,
        questionId: updated.questionId,
        statementPreview: preview(question.statement),
        correctAnswer: question.correctAnswer,
        reason: updated.reason,
        status: updated.status,
        resolution: updated.resolution,
        createdAt: updated.createdAt.toISOString(),
        annulled: question.annulled,
      };
    },
  );

  r.patch(
    "/api/moderation/questions/:id",
    {
      preHandler: editors,
      schema: {
        tags: ["moderation"],
        params: z.object({ id: z.uuid() }),
        body: editorQuestionPatchSchema,
        response: {
          200: z.object({ id: z.uuid(), annulled: z.boolean(), correctAnswer: z.string().nullable() }),
          ...errors,
        },
      },
    },
    async (request) => {
      const actor = requireUser(request);
      const [question] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, request.params.id), isNull(questions.ownerUserId)));
      if (!question) throw notFound("Questão do catálogo não encontrada.");
      const [updated] = await db
        .update(questions)
        .set(request.body)
        .where(eq(questions.id, question.id))
        .returning();
      if (!updated) throw notFound();
      await recordAudit(db, {
        action: AUDIT_ACTIONS.QUESTION_EDITED,
        actorUserId: actor.id,
        targetType: "question",
        targetId: question.id,
        metadata: { fields: Object.keys(request.body) },
        ipAddress: request.clientIp,
      });
      return { id: updated.id, annulled: updated.annulled, correctAnswer: updated.correctAnswer };
    },
  );
}
