import { auditLogs, consents, questionReports, seedSampleData, users } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD,
  TestClient,
  createTestContext,
  createVerifiedUser,
  resetDatabase,
  type TestContext,
} from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedSampleData(ctx.db);
});

describe("painel admin", () => {
  it("feature flags: só admin lista e altera, com auditoria", async () => {
    const { client: user } = await createVerifiedUser(ctx, "user@exemplo.com");
    const { client: admin, userId: adminId } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
    expect((await user.get("/api/admin/feature-flags")).statusCode).toBe(403);

    const flags = (await admin.get("/api/admin/feature-flags")).json();
    expect(flags.map((f: { key: string }) => f.key)).toContain("mock_exams");

    const res = await admin.patch("/api/admin/feature-flags/mock_exams", { enabled: false });
    expect(res.json().enabled).toBe(false);
    const [log] = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "admin.feature_flag_changed"));
    expect(log).toMatchObject({ actorUserId: adminId, targetId: "mock_exams" });
  });

  it("métricas agregadas refletem o uso real", async () => {
    const { client: user } = await createVerifiedUser(ctx, "user@exemplo.com");
    const { client: admin } = await createVerifiedUser(ctx, "admin@exemplo.com", "admin");
    const questionId = (await user.get("/api/questions")).json().items[0].id;
    await user.post(`/api/questions/${questionId}/attempts`, { answer: "A", idempotencyKey: randomUUID() });

    const m = (await admin.get("/api/admin/metrics")).json();
    expect(m.users).toMatchObject({ total: 2, verified: 2 });
    expect(m.activeUsers.last7Days).toBe(1);
    expect(m.questionsAnswered.total).toBe(1);
    expect(m.catalog.questions).toBe(12);
    expect((await user.get("/api/admin/metrics")).statusCode).toBe(403);
  });
});

describe("moderação (editor)", () => {
  it("editor resolve reporte e anula questão; usuário comum não modera", async () => {
    const { client: user } = await createVerifiedUser(ctx, "user@exemplo.com");
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const questionId = (await user.get("/api/questions")).json().items[0].id;
    await user.post(`/api/questions/${questionId}/reports`, { reason: "O gabarito oficial é outro." });

    expect((await user.get("/api/moderation/reports")).statusCode).toBe(403);
    const reports = (await editor.get("/api/moderation/reports")).json();
    expect(reports).toHaveLength(1);
    expect(reports[0]).not.toHaveProperty("userId");

    const annul = await editor.patch(`/api/moderation/questions/${questionId}`, { annulled: true });
    expect(annul.json().annulled).toBe(true);
    const resolved = await editor.patch(`/api/moderation/reports/${reports[0].id}`, {
      status: "aceito",
      resolution: "Questão anulada pela banca.",
    });
    expect(resolved.json()).toMatchObject({ status: "aceito", annulled: true });
    expect(
      (
        await editor.patch(`/api/moderation/reports/${reports[0].id}`, {
          status: "rejeitado",
          resolution: "Não procede.",
        })
      ).statusCode,
    ).toBe(409);

    // Questão anulada não aceita tentativa.
    expect(
      (
        await user.post(`/api/questions/${questionId}/attempts`, {
          answer: "A",
          idempotencyKey: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
  });
});

describe("LGPD", () => {
  it("exporta os dados do titular sem hash de senha nem token de sessão", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    await client.patch("/api/me/profile", { displayName: "Ana" });
    const res = await client.get("/api/me/export");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="aprovaai-meus-dados-/);
    const data = res.json();
    expect(data.account.email).toBe("a@exemplo.com");
    expect(data.profile.displayName).toBe("Ana");
    expect(data.consents).toHaveLength(2);
    expect(res.body).not.toMatch(/\$argon2id\$/);
    const [session] = data.sessions;
    expect(session).not.toHaveProperty("token");
  });

  it("exclui a conta: exige e-mail e senha, apaga dados e anonimiza auditoria e aceite", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "a@exemplo.com");
    const questionId = (await client.get("/api/questions")).json().items[0].id;
    await client.post(`/api/questions/${questionId}/attempts`, { answer: "A", idempotencyKey: randomUUID() });
    await client.post(`/api/questions/${questionId}/reports`, { reason: "Enunciado com erro de digitação." });

    expect(
      (
        await client.request("DELETE", "/api/me", {
          confirmEmail: "outro@exemplo.com",
          password: DEFAULT_PASSWORD,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await client.request("DELETE", "/api/me", {
          confirmEmail: "a@exemplo.com",
          password: "senhaErrada123",
        })
      ).statusCode,
    ).toBe(400);

    const res = await client.request("DELETE", "/api/me", {
      confirmEmail: "a@exemplo.com",
      password: DEFAULT_PASSWORD,
    });
    expect(res.statusCode).toBe(204);
    expect((await client.get("/api/me")).statusCode).toBe(401);

    expect(await ctx.db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await ctx.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, userId))).toHaveLength(0);
    const [deletion] = await ctx.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "privacy.account_deleted"));
    expect(deletion).toMatchObject({ actorUserId: null, targetId: userId });
    // Aceite dos termos e reporte ficam, mas sem vínculo com a pessoa.
    const keptConsents = await ctx.db.select().from(consents);
    expect(keptConsents.length).toBe(2);
    expect(keptConsents.every((c) => c.userId === null)).toBe(true);
    const [report] = await ctx.db.select().from(questionReports);
    expect(report?.userId).toBeNull();

    // E-mail fica livre para um novo cadastro.
    const fresh = await new TestClient(ctx.app).post("/api/auth/sign-up/email", {
      name: "Ana de novo",
      email: "a@exemplo.com",
      password: DEFAULT_PASSWORD,
      acceptTerms: true,
    });
    expect(fresh.statusCode).toBe(200);
    expect(await ctx.db.select().from(users).where(eq(users.email, "a@exemplo.com"))).toHaveLength(1);
  });
});
