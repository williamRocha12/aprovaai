// Painel admin: feature flags e métricas de uso agregadas (sem dados individuais).
import {
  exams,
  featureFlags,
  questionAttempts,
  questionReports,
  questions,
  studySessions,
  userExamGoals,
  users,
  type Database,
} from "@aprovaai/db";
import {
  adminMetricsSchema,
  apiErrorSchema,
  featureFlagSchema,
  updateFeatureFlagSchema,
} from "@aprovaai/shared";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AUDIT_ACTIONS, recordAudit } from "../../lib/audit";
import { notFound } from "../../lib/errors";
import { requireRole, requireUser } from "../../plugins/auth-context";

const errors = { 400: apiErrorSchema, 401: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema };

export function registerAdminPlatformRoutes(app: FastifyInstance, db: Database): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const adminOnly = requireRole("admin");

  r.get(
    "/api/admin/feature-flags",
    {
      preHandler: adminOnly,
      schema: { tags: ["admin"], response: { 200: z.array(featureFlagSchema), ...errors } },
    },
    async () => {
      const rows = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
      return rows.map((f) => ({
        key: f.key,
        enabled: f.enabled,
        description: f.description,
        updatedAt: f.updatedAt.toISOString(),
      }));
    },
  );

  r.patch(
    "/api/admin/feature-flags/:key",
    {
      preHandler: adminOnly,
      schema: {
        tags: ["admin"],
        params: z.object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/) }),
        body: updateFeatureFlagSchema,
        response: { 200: featureFlagSchema, ...errors },
      },
    },
    async (request) => {
      const actor = requireUser(request);
      const [current] = await db.select().from(featureFlags).where(eq(featureFlags.key, request.params.key));
      if (!current) throw notFound("Feature flag não encontrada.");
      const [updated] = await db
        .update(featureFlags)
        .set({ enabled: request.body.enabled, updatedBy: actor.id })
        .where(eq(featureFlags.key, current.key))
        .returning();
      if (!updated) throw notFound();
      await recordAudit(db, {
        action: AUDIT_ACTIONS.FEATURE_FLAG_CHANGED,
        actorUserId: actor.id,
        targetType: "feature_flag",
        targetId: current.key,
        metadata: { from: current.enabled, to: updated.enabled },
        ipAddress: request.clientIp,
      });
      return {
        key: updated.key,
        enabled: updated.enabled,
        description: updated.description,
        updatedAt: updated.updatedAt.toISOString(),
      };
    },
  );

  r.get(
    "/api/admin/metrics",
    { preHandler: adminOnly, schema: { tags: ["admin"], response: { 200: adminMetricsSchema, ...errors } } },
    async () => {
      const d7 = new Date(Date.now() - 7 * 86_400_000);
      const d30 = new Date(Date.now() - 30 * 86_400_000);
      const value = async (query: Promise<{ value: number }[]>) => (await query)[0]?.value ?? 0;

      // Usuário ativo = teve sessão de estudo ou respondeu questão no período (contagem distinta, sem identificar ninguém).
      const activeSince = (since: Date) =>
        db.execute<{ value: number }>(sql`
          select count(distinct user_id)::int as value from (
            select user_id from ${studySessions} where started_at >= ${since.toISOString()}
            union select user_id from ${questionAttempts} where answered_at >= ${since.toISOString()}
          ) active
        `);

      const [usersRow] = await db
        .select({
          total: sql<number>`count(*)::int`,
          verified: sql<number>`count(*) filter (where ${users.emailVerified})::int`,
          disabled: sql<number>`count(*) filter (where ${users.status} = 'disabled')::int`,
        })
        .from(users)
        .where(isNull(users.deletedAt));
      const [active7] = [...(await activeSince(d7))];
      const [active30] = [...(await activeSince(d30))];

      const [attemptsRow] = await db
        .select({
          total: sql<number>`count(*)::int`,
          last7: sql<number>`count(*) filter (where ${questionAttempts.answeredAt} >= ${d7.toISOString()})::int`,
          last30: sql<number>`count(*) filter (where ${questionAttempts.answeredAt} >= ${d30.toISOString()})::int`,
        })
        .from(questionAttempts);
      const [minutesRow] = await db
        .select({
          last7: sql<number>`coalesce(sum(${studySessions.netMinutes}) filter (where ${studySessions.startedAt} >= ${d7.toISOString()}), 0)::int`,
          last30: sql<number>`coalesce(sum(${studySessions.netMinutes}) filter (where ${studySessions.startedAt} >= ${d30.toISOString()}), 0)::int`,
        })
        .from(studySessions);

      return {
        users: {
          total: usersRow?.total ?? 0,
          verified: usersRow?.verified ?? 0,
          disabled: usersRow?.disabled ?? 0,
          withGoal: await value(
            db
              .select({ value: sql<number>`count(distinct ${userExamGoals.userId})::int` })
              .from(userExamGoals)
              .where(eq(userExamGoals.status, "ativo")),
          ),
        },
        activeUsers: { last7Days: active7?.value ?? 0, last30Days: active30?.value ?? 0 },
        questionsAnswered: {
          last7Days: attemptsRow?.last7 ?? 0,
          last30Days: attemptsRow?.last30 ?? 0,
          total: attemptsRow?.total ?? 0,
        },
        studyMinutes: { last7Days: minutesRow?.last7 ?? 0, last30Days: minutesRow?.last30 ?? 0 },
        catalog: {
          exams: await value(db.select({ value: count() }).from(exams).where(isNull(exams.ownerUserId))),
          drafts: await value(
            db
              .select({ value: count() })
              .from(exams)
              .where(and(isNull(exams.ownerUserId), sql`${exams.contentStatus} <> 'validado'`)),
          ),
          questions: await value(
            db.select({ value: count() }).from(questions).where(isNull(questions.ownerUserId)),
          ),
          openReports: await value(
            db.select({ value: count() }).from(questionReports).where(eq(questionReports.status, "aberto")),
          ),
        },
      };
    },
  );
}
