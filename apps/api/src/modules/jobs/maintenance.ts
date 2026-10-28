// Limpeza diária (política de retenção em docs/security.md).
import { loginAttempts, rateLimits, sessions, users, type Database } from "@aprovaai/db";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

export const UNVERIFIED_ACCOUNT_DAYS = 30;

export async function maintenanceCleanup(db: Database): Promise<Record<string, number>> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const expiredSessions = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  const oldRateLimits = await db
    .delete(rateLimits)
    .where(lt(rateLimits.lastRequest, dayAgo.getTime()))
    .returning({ id: rateLimits.id });
  const oldAttempts = await db
    .delete(loginAttempts)
    .where(
      and(
        lt(loginAttempts.lastFailedAt, dayAgo),
        or(isNull(loginAttempts.lockedUntil), lt(loginAttempts.lockedUntil, now)),
      ),
    )
    .returning({ key: loginAttempts.emailHash });
  // Contas que nunca confirmaram o e-mail: removidas (minimização de dados, LGPD).
  const unverified = await db
    .delete(users)
    .where(
      and(
        eq(users.emailVerified, false),
        lt(users.createdAt, sql`now() - (${UNVERIFIED_ACCOUNT_DAYS} || ' days')::interval`),
      ),
    )
    .returning({ id: users.id });
  return {
    expiredSessions: expiredSessions.length,
    rateLimits: oldRateLimits.length,
    loginAttempts: oldAttempts.length,
    unverifiedAccounts: unverified.length,
  };
}
