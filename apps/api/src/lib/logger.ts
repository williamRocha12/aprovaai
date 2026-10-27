import type { FastifyServerOptions } from "fastify";
import type { AppConfig } from "../config";

/** Caminhos que nunca podem aparecer nos logs (senhas, tokens, cookies). */
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.newPassword",
  "*.currentPassword",
  "*.token",
];

/** Remove a query string da URL logada: links de verificação e reset carregam tokens nela. */
function stripQuery(url: string | undefined): string | undefined {
  return url?.split("?")[0];
}

export function buildLoggerOptions(config: AppConfig): FastifyServerOptions["logger"] {
  if (config.NODE_ENV === "test") return false;
  return {
    level: config.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    serializers: {
      req: (req: { method: string; url?: string; id: string }) => ({
        id: req.id,
        method: req.method,
        url: stripQuery(req.url),
      }),
    },
    ...(config.isProduction
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }),
  };
}
