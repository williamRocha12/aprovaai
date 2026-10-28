// Radar de editais: fila de confirmação (editor/admin) e status das fontes. A coleta roda pelo cron diário.
import type { Database } from "@aprovaai/db";
import {
  apiErrorSchema,
  confirmLeadSchema,
  examLeadSchema,
  leadListQuerySchema,
  radarOverviewSchema,
} from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import { requireRole, requireUser } from "../../plugins/auth-context";
import type { RadarService } from "./service";

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
};
const idParams = z.object({ id: z.uuid() });

export function registerRadarRoutes(
  app: FastifyInstance,
  db: Database,
  service: RadarService,
  collectNow: (day: string) => Promise<unknown>,
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const editors = { preHandler: requireRole("editor", "admin") };
  const tags = ["radar"];

  r.get(
    "/api/radar",
    { ...editors, schema: { tags, response: { 200: radarOverviewSchema, ...errors } } },
    async () => service.overview(),
  );

  r.get(
    "/api/radar/leads",
    {
      ...editors,
      schema: {
        tags,
        querystring: leadListQuerySchema,
        response: { 200: z.array(examLeadSchema), ...errors },
      },
    },
    async (request) => service.listLeads(request.query.status, request.query.uf),
  );

  r.post(
    "/api/radar/leads/:id/confirm",
    {
      ...editors,
      schema: {
        tags,
        params: idParams,
        body: confirmLeadSchema,
        response: { 200: z.object({ examId: z.uuid() }), ...errors },
      },
    },
    async (request) => {
      const user = requireUser(request);
      const result = await service.confirmLead(user, request.params.id, request.body);
      await recordAudit(db, {
        action: AUDIT_ACTIONS.RADAR_LEAD_CONFIRMED,
        actorUserId: user.id,
        targetType: "exam",
        targetId: result.examId,
        metadata: { leadId: request.params.id },
        ipAddress: request.clientIp,
      });
      return result;
    },
  );

  r.post(
    "/api/radar/leads/:id/discard",
    { ...editors, schema: { tags, params: idParams, response: { 204: z.null(), ...errors } } },
    async (request, reply) => {
      const user = requireUser(request);
      await service.discardLead(user, request.params.id);
      await recordAudit(db, {
        action: AUDIT_ACTIONS.RADAR_LEAD_DISCARDED,
        actorUserId: user.id,
        targetType: "exam_lead",
        targetId: request.params.id,
        ipAddress: request.clientIp,
      });
      return reply.status(204).send(null);
    },
  );

  // Coleta manual (admin): mesma rotina do cron, para um dia específico (ex.: ontem).
  r.post(
    "/api/radar/collect",
    {
      preHandler: requireRole("admin"),
      schema: {
        tags,
        body: z.object({ day: z.iso.date() }),
        response: { 200: z.unknown(), ...errors },
      },
    },
    async (request) => collectNow(request.body.day),
  );
}
