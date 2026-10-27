import { users, type Database } from "@aprovaai/db";
import type { UserRole } from "@aprovaai/shared";
import { fromNodeHeaders } from "better-auth/node";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Auth } from "../auth/auth";
import { forbidden, unauthenticated } from "../lib/errors";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
  }
}

/**
 * Resolve a sessão do cookie e carrega papel/status direto do banco a cada requisição:
 * mudança de papel ou desativação vale na hora, sem esperar a sessão expirar.
 */
export function registerAuthContext(app: FastifyInstance, auth: Auth, db: Database): void {
  app.decorateRequest("currentUser", null);

  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/auth/") || !request.headers.cookie) return;

    const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!result) return;

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.id, result.user.id), eq(users.status, "active"), isNull(users.deletedAt)));
    request.currentUser = user ?? null;
  });
}

/** Garante usuário autenticado e devolve-o tipado (uso dentro dos handlers). */
export function requireUser(request: FastifyRequest): CurrentUser {
  if (!request.currentUser) throw unauthenticated();
  return request.currentUser;
}

export const requireAuth: preHandlerAsyncHookHandler = async (request) => {
  requireUser(request);
};

/** RBAC: autorização sempre no backend. */
export function requireRole(...roles: UserRole[]): preHandlerAsyncHookHandler {
  return async (request) => {
    const user = requireUser(request);
    if (!roles.includes(user.role)) throw forbidden();
  };
}
