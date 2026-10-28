import { createDb, loadRootEnv, seedReferenceData, users, type Database } from "@aprovaai/db";
import type { UserRole } from "@aprovaai/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app";
import type { AiProvider } from "../src/lib/ai/provider";
import type { SourceConnector } from "../src/modules/radar/connectors/types";
import { loadConfig } from "../src/config";
import { MemoryEmailProvider } from "../src/lib/email/providers";

export const APP_ORIGIN = "http://localhost:3000";
export const DEFAULT_PASSWORD = "concurso2026";

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  email: MemoryEmailProvider;
  close: () => Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
  deps: { ai?: AiProvider | null; radarConnectors?: SourceConnector[] } = {},
): Promise<TestContext> {
  loadRootEnv();
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    APP_URL: APP_ORIGIN,
    TRUSTED_ORIGINS: "",
    EMAIL_PROVIDER: "memory",
    RATE_LIMIT_ENABLED: "false",
    BETTER_AUTH_SECRET: "segredo-de-teste-com-mais-de-32-caracteres!!",
    // Testes não herdam credenciais reais do .env local; quem precisa passa via overrides.
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    ...overrides,
  });
  const { db, close } = createDb(config.DATABASE_URL, { max: 5 });
  const email = new MemoryEmailProvider();
  // IA real nunca roda nos testes: sem dublê injetado, fica desligada.
  // Sem rede nos testes: por padrão nenhum conector do radar.
  const { app } = await buildApp({
    config,
    db,
    email,
    ai: deps.ai ?? null,
    radarConnectors: deps.radarConnectors ?? [],
  });
  await app.ready();
  return {
    app,
    db,
    email,
    close: async () => {
      await app.close();
      await close();
    },
  };
}

/** Limpa todas as tabelas do schema public entre testes e recria os dados de referência. */
export async function resetDatabase(db: Database): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = [...rows].map((r) => `"${r.tablename}"`).join(", ");
  if (tables) await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
  await seedReferenceData(db);
}

/** Cliente HTTP de teste com "pote" de cookies, como um navegador. */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly app: FastifyInstance) {}

  async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    body?: unknown,
    options: { origin?: string | null } = {},
  ): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = {};
    const origin = options.origin === undefined ? APP_ORIGIN : options.origin;
    if (origin) headers.origin = origin;
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    if (body !== undefined) headers["content-type"] = "application/json";

    const response = await this.app.inject({
      method,
      url,
      headers,
      ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
    });
    this.storeCookies(response);
    return response;
  }

  get = (url: string) => this.request("GET", url);
  post = (url: string, body: unknown = {}) => this.request("POST", url, body);
  patch = (url: string, body: unknown) => this.request("PATCH", url, body);

  hasSessionCookie(): boolean {
    return [...this.cookies.keys()].some((k) => k.endsWith("session_token"));
  }

  private storeCookies(response: LightMyRequestResponse): void {
    for (const cookie of response.cookies) {
      const expired = cookie.maxAge === 0 || (cookie.expires && cookie.expires.getTime() < Date.now());
      if (expired || cookie.value === "") this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
  }
}

/** Extrai o primeiro link do e-mail de texto. */
export function linkFromEmail(text: string): string {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("Nenhum link no e-mail.");
  return match[0];
}

/** Converte a URL pública (APP_URL) no caminho que a API recebe pelo rewrite. */
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname + parsed.search;
}

export async function signUp(client: TestClient, emailAddress: string, name = "Candidato Teste") {
  return client.post("/api/auth/sign-up/email", {
    name,
    email: emailAddress,
    password: DEFAULT_PASSWORD,
    acceptTerms: true,
  });
}

export async function signIn(client: TestClient, emailAddress: string, password = DEFAULT_PASSWORD) {
  return client.post("/api/auth/sign-in/email", { email: emailAddress, password });
}

/**
 * Cadastra, verifica o e-mail pelo link recebido e faz login.
 * Devolve o cliente já autenticado e o id do usuário.
 */
export async function createVerifiedUser(
  ctx: TestContext,
  emailAddress: string,
  role: UserRole = "user",
): Promise<{ client: TestClient; userId: string }> {
  const client = new TestClient(ctx.app);
  const signUpResponse = await signUp(client, emailAddress);
  if (signUpResponse.statusCode !== 200) throw new Error(`Cadastro falhou: ${signUpResponse.body}`);

  const message = ctx.email.lastTo(emailAddress);
  if (!message) throw new Error("E-mail de verificação não enviado.");
  await client.get(pathOf(linkFromEmail(message.text)));

  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, emailAddress));
  if (!user) throw new Error("Usuário não criado.");
  if (role !== "user") await ctx.db.update(users).set({ role }).where(eq(users.id, user.id));

  const fresh = new TestClient(ctx.app);
  const signInResponse = await signIn(fresh, emailAddress);
  if (signInResponse.statusCode !== 200) throw new Error(`Login falhou: ${signInResponse.body}`);
  return { client: fresh, userId: user.id };
}
