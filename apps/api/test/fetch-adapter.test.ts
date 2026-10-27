// O adaptador Fetch é o caminho real em produção (Vercel Function → Fastify).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleFetchRequest } from "../src/fetch-adapter";
import { APP_ORIGIN, DEFAULT_PASSWORD, createTestContext, resetDatabase, type TestContext } from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
});

const fetchApi = (path: string, init: RequestInit = {}) =>
  handleFetchRequest(ctx.app, new Request(`${APP_ORIGIN}${path}`, init));

describe("handleFetchRequest", () => {
  it("responde GET com status, headers e corpo", async () => {
    const res = await fetchApi("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("repassa corpo JSON e devolve vários Set-Cookie separados", async () => {
    const json = { "content-type": "application/json", origin: APP_ORIGIN };
    await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        name: "Ana",
        email: "ana@exemplo.com",
        password: DEFAULT_PASSWORD,
        acceptTerms: true,
      }),
    });
    const link = ctx.email.lastTo("ana@exemplo.com")?.text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    const verify = await fetchApi(new URL(link ?? "").pathname + new URL(link ?? "").search, {
      redirect: "manual",
    });
    expect(verify.status).toBe(302);

    const signIn = await fetchApi("/api/auth/sign-in/email", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: "ana@exemplo.com", password: DEFAULT_PASSWORD }),
    });
    expect(signIn.status).toBe(200);
    const cookies = signIn.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("aprovaai.session_token="))).toBe(true);

    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const me = await fetchApi("/api/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { email: string }).email).toBe("ana@exemplo.com");
  });

  it("devolve o formato de erro padrão para rota inexistente", async () => {
    const res = await fetchApi("/api/nao-existe");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
