import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ERROR_CODES } from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";
import { clientIpFrom } from "../lib/client-ip";
import { AppError } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Proteção contra CSRF: além do cookie SameSite=Lax, toda requisição que altera estado
 * precisa vir de uma origem confiável (o próprio web). O Better Auth faz a mesma checagem
 * nas rotas dele; este hook cobre as rotas de domínio.
 */
export function assertTrustedOrigin(method: string, origin: string | undefined, trusted: string[]): void {
  if (SAFE_METHODS.has(method)) return;
  if (!origin || !trusted.includes(origin)) {
    throw new AppError(403, ERROR_CODES.INVALID_ORIGIN, "Origem da requisição não permitida.");
  }
}

declare module "fastify" {
  interface FastifyRequest {
    /** IP real do cliente (header confiável) ou do socket. Usado em rate limit e auditoria. */
    clientIp: string;
  }
}

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.decorateRequest("clientIp", "");
  app.addHook("onRequest", async (request) => {
    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    request.clientIp = clientIpFrom(header, config.CLIENT_IP_HEADER, request.ip) ?? request.ip;
  });

  // API só responde JSON: CSP fechada. O Swagger UI (dev) precisa de inline styles/scripts.
  await app.register(helmet, {
    contentSecurityPolicy: config.apiDocsEnabled
      ? false
      : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  // O navegador fala com a API pelo rewrite do Next (mesma origem). CORS só para as origens confiáveis.
  await app.register(cors, {
    origin: config.trustedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });

  // Limite geral por IP nas rotas de domínio. As rotas de auth têm regras próprias no Better Auth.
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_ENABLED ? 300 : 1_000_000,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.clientIp,
    allowList: (req) =>
      req.url.startsWith("/api/auth/") || req.url === "/api/health" || req.url === "/api/ready",
  });

  app.addHook("onRequest", async (request) => {
    assertTrustedOrigin(request.method, request.headers.origin, config.trustedOrigins);
  });
}
