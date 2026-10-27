import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { clientIpFrom } from "./lib/client-ip";

const base = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("loadConfig", () => {
  it("trata variável vazia como não definida", () => {
    const cfg = loadConfig({ ...base, GOOGLE_CLIENT_ID: "", API_DOCS_ENABLED: "" });
    expect(cfg.googleConfigured).toBe(false);
    expect(cfg.apiDocsEnabled).toBe(true);
  });

  it("exige segredo com 32+ caracteres", () => {
    expect(() => loadConfig({ ...base, BETTER_AUTH_SECRET: "curto" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("em produção exige CLIENT_IP_HEADER e desliga o /docs por padrão", () => {
    const exposed = { ...base, APP_URL: "https://aprovaai.exemplo.com", NODE_ENV: "production" };
    expect(() => loadConfig(exposed)).toThrow(/CLIENT_IP_HEADER/);
    // Build de produção rodando local (E2E) não exige o header.
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).not.toThrow();
    const cfg = loadConfig({ ...base, NODE_ENV: "production", CLIENT_IP_HEADER: "X-Real-IP" });
    expect(cfg.CLIENT_IP_HEADER).toBe("x-real-ip");
    expect(cfg.apiDocsEnabled).toBe(false);
  });

  it("monta as origens confiáveis a partir do APP_URL + extras", () => {
    const cfg = loadConfig({
      ...base,
      TRUSTED_ORIGINS: "https://preview.exemplo.com, https://outra.exemplo.com",
    });
    expect(cfg.trustedOrigins).toEqual([
      "http://localhost:3000",
      "https://preview.exemplo.com",
      "https://outra.exemplo.com",
    ]);
  });
});

describe("loadConfig na Vercel", () => {
  const vercel = { ...base, VERCEL: "1" };

  it("usa x-real-ip por padrão (definido pela borda da Vercel)", () => {
    const cfg = loadConfig({ ...vercel, NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(cfg.CLIENT_IP_HEADER).toBe("x-real-ip");
  });

  it("em preview usa a URL do deploy como APP_URL e origem confiável", () => {
    const cfg = loadConfig({
      ...vercel,
      VERCEL_ENV: "preview",
      VERCEL_URL: "aprovaai-abc123.vercel.app",
      VERCEL_BRANCH_URL: "aprovaai-git-feature.vercel.app",
    });
    expect(cfg.APP_URL).toBe("https://aprovaai-git-feature.vercel.app");
    expect(cfg.trustedOrigins).toEqual([
      "https://aprovaai-git-feature.vercel.app",
      "https://aprovaai-abc123.vercel.app",
    ]);
  });

  it("em produção sem APP_URL cai no domínio de produção do projeto", () => {
    const { APP_URL: _ignored, ...withoutAppUrl } = vercel;
    const cfg = loadConfig({
      ...withoutAppUrl,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "aprovaai.vercel.app",
    });
    expect(cfg.APP_URL).toBe("https://aprovaai.vercel.app");
  });
});

describe("clientIpFrom", () => {
  const headers: Record<string, string> = {
    "x-real-ip": "200.1.1.1",
    "x-forwarded-for": "6.6.6.6, 10.0.0.1",
  };
  const get = (name: string) => headers[name];

  it("ignora X-Forwarded-For quando não há header confiável configurado", () => {
    expect(clientIpFrom(get, undefined, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("usa só o header configurado, pegando o primeiro IP da lista", () => {
    expect(clientIpFrom(get, "x-real-ip")).toBe("200.1.1.1");
    expect(clientIpFrom(get, "x-forwarded-for")).toBe("6.6.6.6");
  });

  it("cai no fallback se o header configurado vier vazio", () => {
    expect(clientIpFrom(() => undefined, "x-real-ip", "127.0.0.1")).toBe("127.0.0.1");
  });
});
