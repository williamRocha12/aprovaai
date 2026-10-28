// Login com Google: só fica disponível com credenciais configuradas E a flag google_login ligada.
// O retorno do Google (callback) não é testado aqui: exigiria o servidor OAuth real.
import { featureFlags } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { APP_ORIGIN, TestClient, createTestContext, resetDatabase, type TestContext } from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({
    GOOGLE_CLIENT_ID: "client-id-de-teste.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "segredo-de-teste",
  });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
});

const setFlag = (enabled: boolean) =>
  ctx.db.update(featureFlags).set({ enabled }).where(eq(featureFlags.key, "google_login"));

const startGoogleSignIn = () =>
  new TestClient(ctx.app).post("/api/auth/sign-in/social", {
    provider: "google",
    callbackURL: "/conta",
    errorCallbackURL: "/entrar?erro=google",
  });

describe("login com Google", () => {
  it("com a flag desligada, o login social não existe e o botão fica oculto", async () => {
    expect((await startGoogleSignIn()).statusCode).toBe(404);
    const config = await new TestClient(ctx.app).get("/api/public/config");
    expect(config.json().googleLoginEnabled).toBe(false);
  });

  it("com a flag ligada, devolve a URL de autorização do Google com o callback certo", async () => {
    await setFlag(true);
    const config = await new TestClient(ctx.app).get("/api/public/config");
    expect(config.json().googleLoginEnabled).toBe(true);

    const res = await startGoogleSignIn();
    expect(res.statusCode).toBe(200);
    const authorizeUrl = new URL(res.json().url);
    expect(authorizeUrl.hostname).toBe("accounts.google.com");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("client-id-de-teste.apps.googleusercontent.com");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(`${APP_ORIGIN}/api/auth/callback/google`);
    expect(authorizeUrl.searchParams.get("prompt")).toBe("select_account");
    // O state amarra o retorno ao navegador que iniciou o login (proteção CSRF do OAuth).
    expect(authorizeUrl.searchParams.get("state")).toBeTruthy();
  });

  it("sem credenciais configuradas, a flag sozinha não ativa o botão", async () => {
    const withoutGoogle = await createTestContext();
    try {
      await setFlag(true);
      const config = await new TestClient(withoutGoogle.app).get("/api/public/config");
      expect(config.json().googleLoginEnabled).toBe(false);
    } finally {
      await withoutGoogle.close();
    }
  });
});
