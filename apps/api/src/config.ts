import { z } from "zod";

const booleanFromEnv = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    DATABASE_URL: z.url(),

    /** URL pública do web (o navegador só fala com ela; o Next repassa /api/* para cá). */
    APP_URL: z.url(),
    /** Origens extras confiáveis, separadas por vírgula (ex.: preview da Vercel). */
    TRUSTED_ORIGINS: z.string().default(""),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET precisa de pelo menos 32 caracteres."),
    RATE_LIMIT_ENABLED: booleanFromEnv.default(true),
    /**
     * Header com o IP real do cliente, preenchido pela borda confiável (ex.: `x-real-ip` na Vercel).
     * O rewrite do Next repassa headers do cliente sem tratar, então só confiamos no header nomeado aqui.
     */
    CLIENT_IP_HEADER: z.string().toLowerCase().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    EMAIL_PROVIDER: z.enum(["smtp", "resend", "memory"]).default("smtp"),
    EMAIL_FROM: z.string().default("AprovaAI <nao-responda@aprovaai.local>"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    RESEND_API_KEY: z.string().optional(),

    /** IA (Etapa F). Sem chave, os recursos de IA ficam desligados (nunca simulados). */
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
    /** Limite de chamadas de IA por usuário por dia. */
    AI_DAILY_QUOTA: z.coerce.number().int().min(0).default(30),

    /** Segredo do Vercel Cron (header Authorization: Bearer). Sem ele, a rota de cron não existe. */
    CRON_SECRET: z.string().min(16).optional(),

    /** Publica o Swagger UI em /docs. Em produção fica desligado por padrão. */
    API_DOCS_ENABLED: booleanFromEnv.optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.EMAIL_PROVIDER === "resend" && !cfg.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Obrigatória quando EMAIL_PROVIDER=resend.",
      });
    }
    // Build de produção rodando em localhost (ex.: E2E com `next start`) não está exposto à internet.
    const isLocalhost = ["localhost", "127.0.0.1"].includes(new URL(cfg.APP_URL).hostname);
    if (cfg.NODE_ENV === "production" && !cfg.CLIENT_IP_HEADER && !isLocalhost) {
      ctx.addIssue({
        code: "custom",
        path: ["CLIENT_IP_HEADER"],
        message: "Obrigatória em produção: sem ela o rate limit vira um balde único para todos.",
      });
    }
    if (cfg.NODE_ENV === "production" && cfg.EMAIL_PROVIDER === "memory") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "Provider 'memory' não é permitido em produção.",
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema> & {
  trustedOrigins: string[];
  isProduction: boolean;
  googleConfigured: boolean;
  aiConfigured: boolean;
  apiDocsEnabled: boolean;
};

/**
 * Padrões quando rodando na Vercel (variáveis de sistema VERCEL_*):
 * - a borda da Vercel define `x-real-ip` com o IP do cliente (não dá para forjar);
 * - em preview, a URL do deploy vira APP_URL, para links de e-mail e checagem de origem funcionarem;
 * - em produção, APP_URL cai no domínio de produção do projeto se não for definida.
 */
function withVercelDefaults(env: Record<string, string>): Record<string, string> {
  if (!env.VERCEL) return env;
  const result = { ...env };
  result.CLIENT_IP_HEADER ??= "x-real-ip";

  const deploymentHosts = [env.VERCEL_BRANCH_URL, env.VERCEL_URL].filter(Boolean).map((h) => `https://${h}`);
  if (env.VERCEL_ENV === "preview" && deploymentHosts[0]) {
    result.APP_URL = deploymentHosts[0];
  } else if (!result.APP_URL && env.VERCEL_PROJECT_PRODUCTION_URL) {
    result.APP_URL = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  result.TRUSTED_ORIGINS = [env.TRUSTED_ORIGINS, ...deploymentHosts].filter(Boolean).join(",");
  return result;
}

/** Lê e valida as variáveis de ambiente. Falha cedo com mensagem clara se algo estiver faltando. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Variável vazia no .env (ex.: `GOOGLE_CLIENT_ID=`) conta como não definida.
  const defined = Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
    ),
  );
  const parsed = configSchema.safeParse(withVercelDefaults(defined));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  const cfg = parsed.data;
  const extraOrigins = cfg.TRUSTED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    ...cfg,
    trustedOrigins: [...new Set([new URL(cfg.APP_URL).origin, ...extraOrigins])],
    isProduction: cfg.NODE_ENV === "production",
    googleConfigured: Boolean(cfg.GOOGLE_CLIENT_ID && cfg.GOOGLE_CLIENT_SECRET),
    aiConfigured: Boolean(cfg.ANTHROPIC_API_KEY),
    apiDocsEnabled: cfg.API_DOCS_ENABLED ?? cfg.NODE_ENV !== "production",
  };
}
