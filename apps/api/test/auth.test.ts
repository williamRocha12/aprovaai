import { accounts, auditLogs, consents, sessions, userProfiles, users } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOCKOUT_POLICY } from "../src/auth/lockout";
import {
  DEFAULT_PASSWORD,
  TestClient,
  createTestContext,
  createVerifiedUser,
  linkFromEmail,
  pathOf,
  resetDatabase,
  signIn,
  signUp,
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
  ctx.email.sent.length = 0;
});

async function actionsFor(userId: string): Promise<string[]> {
  const rows = await ctx.db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.actorUserId, userId));
  return rows.map((r) => r.action);
}

describe("cadastro", () => {
  it("exige aceite dos termos", async () => {
    const client = new TestClient(ctx.app);
    const res = await client.post("/api/auth/sign-up/email", {
      name: "Ana",
      email: "ana@exemplo.com",
      password: DEFAULT_PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect(await ctx.db.select().from(users)).toHaveLength(0);
  });

  it("cria usuário com senha Argon2id, perfil, consentimentos, auditoria e e-mail de verificação", async () => {
    const res = await signUp(new TestClient(ctx.app), "ana@exemplo.com");
    expect(res.statusCode).toBe(200);

    const [user] = await ctx.db.select().from(users).where(eq(users.email, "ana@exemplo.com"));
    expect(user).toMatchObject({ role: "user", status: "active", emailVerified: false });
    if (!user) return;

    const [account] = await ctx.db.select().from(accounts).where(eq(accounts.userId, user.id));
    expect(account?.password).toMatch(/^\$argon2id\$/);

    expect(await ctx.db.select().from(userProfiles).where(eq(userProfiles.userId, user.id))).toHaveLength(1);
    const userConsents = await ctx.db.select().from(consents).where(eq(consents.userId, user.id));
    expect(userConsents.map((c) => c.document).sort()).toEqual(["privacy", "terms"]);
    expect(await actionsFor(user.id)).toContain("auth.sign_up");

    expect(ctx.email.lastTo("ana@exemplo.com")?.subject).toMatch(/Confirme seu e-mail/);
  });

  it("não revela se o e-mail já está cadastrado", async () => {
    await createVerifiedUser(ctx, "ana@exemplo.com");
    const res = await signUp(new TestClient(ctx.app), "ana@exemplo.com", "Outra Pessoa");
    expect(res.statusCode).toBe(200);
    expect(await ctx.db.select().from(users)).toHaveLength(1);
  });
});

describe("verificação de e-mail e login", () => {
  it("bloqueia login antes de verificar o e-mail", async () => {
    const client = new TestClient(ctx.app);
    await signUp(client, "ana@exemplo.com");
    const res = await signIn(client, "ana@exemplo.com");
    expect(res.statusCode).toBe(403);
    expect(client.hasSessionCookie()).toBe(false);
  });

  it("verifica pelo link, faz login, acessa /api/me e faz logout", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "ana@exemplo.com");

    const me = await client.get("/api/me");
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      id: userId,
      email: "ana@exemplo.com",
      emailVerified: true,
      role: "user",
    });

    const out = await client.post("/api/auth/sign-out");
    expect(out.statusCode).toBe(200);
    expect((await client.get("/api/me")).statusCode).toBe(401);

    const actions = await actionsFor(userId);
    expect(actions).toEqual(expect.arrayContaining(["auth.email_verified", "auth.sign_in", "auth.sign_out"]));
  });

  it("token de verificação inválido não verifica ninguém", async () => {
    const client = new TestClient(ctx.app);
    await signUp(client, "ana@exemplo.com");
    await client.get("/api/auth/verify-email?token=token-falso");
    const [user] = await ctx.db.select().from(users);
    expect(user?.emailVerified).toBe(false);
  });

  it("senha errada para e-mail existente e inexistente responde igual", async () => {
    await createVerifiedUser(ctx, "ana@exemplo.com");
    const existing = await signIn(new TestClient(ctx.app), "ana@exemplo.com", "senhaErrada123");
    const missing = await signIn(new TestClient(ctx.app), "ninguem@exemplo.com", "senhaErrada123");
    expect(existing.statusCode).toBe(401);
    expect(missing.statusCode).toBe(existing.statusCode);
    expect(missing.json()).toEqual(existing.json());
  });
});

describe("bloqueio temporário", () => {
  it(`bloqueia após ${LOCKOUT_POLICY.maxFailures} falhas, mesmo com a senha certa depois`, async () => {
    await createVerifiedUser(ctx, "ana@exemplo.com");
    for (let i = 0; i < LOCKOUT_POLICY.maxFailures; i++) {
      expect((await signIn(new TestClient(ctx.app), "ana@exemplo.com", "senhaErrada123")).statusCode).toBe(
        401,
      );
    }
    const res = await signIn(new TestClient(ctx.app), "ana@exemplo.com");
    expect(res.statusCode).toBe(429);
  });

  it("e-mail inexistente também é bloqueado (sem enumeração)", async () => {
    for (let i = 0; i < LOCKOUT_POLICY.maxFailures; i++) {
      await signIn(new TestClient(ctx.app), "ninguem@exemplo.com", "senhaErrada123");
    }
    expect((await signIn(new TestClient(ctx.app), "ninguem@exemplo.com", "senhaErrada123")).statusCode).toBe(
      429,
    );
  });
});

describe("sessões", () => {
  it("logout de todas as sessões derruba os outros dispositivos", async () => {
    const { client: laptop, userId } = await createVerifiedUser(ctx, "ana@exemplo.com");
    const phone = new TestClient(ctx.app);
    await signIn(phone, "ana@exemplo.com");
    expect((await phone.get("/api/me")).statusCode).toBe(200);

    expect((await laptop.post("/api/auth/revoke-sessions")).statusCode).toBe(200);

    expect((await phone.get("/api/me")).statusCode).toBe(401);
    expect((await laptop.get("/api/me")).statusCode).toBe(401);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);
    expect(await actionsFor(userId)).toContain("auth.sign_out_all");
  });

  it("usuário desativado não consegue entrar", async () => {
    const { userId } = await createVerifiedUser(ctx, "ana@exemplo.com");
    await ctx.db.update(users).set({ status: "disabled" }).where(eq(users.id, userId));
    const res = await signIn(new TestClient(ctx.app), "ana@exemplo.com");
    expect(res.statusCode).toBe(403);
  });
});

describe("recuperação de senha", () => {
  it("responde igual para e-mail cadastrado e não cadastrado", async () => {
    await createVerifiedUser(ctx, "ana@exemplo.com");
    const body = (email: string) => ({ email, redirectTo: "/redefinir-senha" });
    const known = await new TestClient(ctx.app).post(
      "/api/auth/request-password-reset",
      body("ana@exemplo.com"),
    );
    const unknown = await new TestClient(ctx.app).post(
      "/api/auth/request-password-reset",
      body("ninguem@exemplo.com"),
    );
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual(known.json());
    expect(ctx.email.lastTo("ninguem@exemplo.com")).toBeUndefined();
  });

  it("redefine com token de uso único e derruba as sessões antigas", async () => {
    const { client: oldSession, userId } = await createVerifiedUser(ctx, "ana@exemplo.com");
    const anon = new TestClient(ctx.app);
    await anon.post("/api/auth/request-password-reset", {
      email: "ana@exemplo.com",
      redirectTo: "/redefinir-senha",
    });

    const message = ctx.email.lastTo("ana@exemplo.com");
    expect(message?.subject).toMatch(/Redefinição de senha/);
    // O link do e-mail redireciona para a página do web com ?token=...
    const redirect = await anon.get(pathOf(linkFromEmail(message?.text ?? "")));
    const location = new URL(String(redirect.headers.location), "http://localhost:3000");
    const token = location.searchParams.get("token");
    expect(token).toBeTruthy();

    const newPassword = "novaSenha2026";
    const reset = await anon.post("/api/auth/reset-password", { token, newPassword });
    expect(reset.statusCode).toBe(200);

    expect((await oldSession.get("/api/me")).statusCode).toBe(401);
    expect((await signIn(new TestClient(ctx.app), "ana@exemplo.com", DEFAULT_PASSWORD)).statusCode).toBe(401);
    expect((await signIn(new TestClient(ctx.app), "ana@exemplo.com", newPassword)).statusCode).toBe(200);

    const reuse = await anon.post("/api/auth/reset-password", { token, newPassword: "outraSenha2026" });
    expect(reuse.statusCode).toBe(400);
    expect(await actionsFor(userId)).toEqual(
      expect.arrayContaining(["auth.password_reset_requested", "auth.password_reset"]),
    );
  });

  it("troca de senha logado exige a senha atual e fica auditada", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "ana@exemplo.com");
    const wrong = await client.post("/api/auth/change-password", {
      currentPassword: "senhaErrada123",
      newPassword: "novaSenha2026",
    });
    expect(wrong.statusCode).toBe(400);

    const ok = await client.post("/api/auth/change-password", {
      currentPassword: DEFAULT_PASSWORD,
      newPassword: "novaSenha2026",
      revokeOtherSessions: true,
    });
    expect(ok.statusCode).toBe(200);
    expect(await actionsFor(userId)).toContain("auth.password_changed");
  });
});

describe("proteção de origem (CSRF)", () => {
  it("rejeita requisição que altera estado sem origem confiável", async () => {
    const { client } = await createVerifiedUser(ctx, "ana@exemplo.com");
    const noOrigin = await client.request("PATCH", "/api/me/profile", { displayName: "X" }, { origin: null });
    expect(noOrigin.statusCode).toBe(403);
    expect(noOrigin.json().error.code).toBe("INVALID_ORIGIN");

    const evil = await client.request(
      "PATCH",
      "/api/me/profile",
      { displayName: "X" },
      { origin: "https://evil.example" },
    );
    expect(evil.statusCode).toBe(403);

    const ok = await client.patch("/api/me/profile", { displayName: "Ana Concurseira" });
    expect(ok.statusCode).toBe(200);
  });
});
