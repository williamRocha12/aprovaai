import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// CSP básica. Next com App Router ainda exige 'unsafe-inline' em scripts sem nonce;
// CSP com nonce está no backlog da Etapa I (hardening).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  // A API (Fastify) e os pacotes internos são TypeScript puro, compilados junto com o web.
  transpilePackages: ["@aprovaai/api", "@aprovaai/core", "@aprovaai/db", "@aprovaai/shared"],
  // Carregados do node_modules em runtime, sem bundle: binário nativo (argon2), worker threads (pino)
  // e arquivos estáticos lidos do disco (swagger-ui).
  serverExternalPackages: [
    "@node-rs/argon2",
    "pino",
    "pino-pretty",
    "@fastify/swagger",
    "@fastify/swagger-ui",
  ],
  poweredByHeader: false,
  async headers() {
    return [
      // As rotas /api/* recebem os headers do helmet (Fastify); aqui ficam os das páginas.
      { source: "/((?!api/).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
