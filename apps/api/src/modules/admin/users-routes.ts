import type { Database } from "@aprovaai/db";
import {
  adminListUsersQuerySchema,
  adminUpdateRoleSchema,
  adminUpdateStatusSchema,
  adminUserSchema,
  apiErrorSchema,
  paginatedSchema,
} from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import { conflict, notFound } from "../../lib/errors";
import { requireRole, requireUser } from "../../plugins/auth-context";
import { AdminUsersRepository } from "./users-repository";

const idParams = z.object({ id: z.uuid() });
const errorResponses = { 400: apiErrorSchema, 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };

export function registerAdminUserRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const repo = new AdminUsersRepository(db);
  const adminOnly = requireRole("admin");

  r.get(
    "/api/admin/users",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["admin"],
        querystring: adminListUsersQuerySchema,
        response: { 200: paginatedSchema(adminUserSchema), ...errorResponses },
      },
    },
    async (request) => {
      const { items, total } = await repo.list(request.query);
      return { items, total, page: request.query.page, pageSize: request.query.pageSize };
    },
  );

  r.patch(
    "/api/admin/users/:id/role",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["admin"],
        params: idParams,
        body: adminUpdateRoleSchema,
        response: { 200: adminUserSchema, 409: apiErrorSchema, ...errorResponses },
      },
    },
    async (request) => {
      const actor = requireUser(request);
      const target = await repo.findById(request.params.id);
      if (!target) throw notFound("Usuário não encontrado.");
      // Evita que o sistema fique sem administrador por engano.
      if (target.id === actor.id) throw conflict("Você não pode alterar o próprio papel.");

      if (target.role !== request.body.role) {
        await repo.setRole(target.id, request.body.role);
        await recordAudit(db, {
          action: AUDIT_ACTIONS.ROLE_CHANGED,
          actorUserId: actor.id,
          targetType: "user",
          targetId: target.id,
          metadata: { from: target.role, to: request.body.role },
          ipAddress: request.clientIp,
        });
      }
      return { ...target, role: request.body.role };
    },
  );

  r.patch(
    "/api/admin/users/:id/status",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["admin"],
        params: idParams,
        body: adminUpdateStatusSchema,
        response: { 200: adminUserSchema, 409: apiErrorSchema, ...errorResponses },
      },
    },
    async (request) => {
      const actor = requireUser(request);
      const target = await repo.findById(request.params.id);
      if (!target) throw notFound("Usuário não encontrado.");
      if (target.id === actor.id) throw conflict("Você não pode desativar a própria conta por aqui.");
      if (
        target.role === "admin" &&
        request.body.status === "disabled" &&
        (await repo.countActiveAdmins()) <= 1
      ) {
        throw conflict("Não é possível desativar o último administrador ativo.");
      }

      if (target.status !== request.body.status) {
        await repo.setStatus(target.id, request.body.status);
        await recordAudit(db, {
          action: AUDIT_ACTIONS.STATUS_CHANGED,
          actorUserId: actor.id,
          targetType: "user",
          targetId: target.id,
          metadata: { from: target.status, to: request.body.status },
          ipAddress: request.clientIp,
        });
      }
      return { ...target, status: request.body.status };
    },
  );
}
