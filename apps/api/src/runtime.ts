import { createDb, loadRootEnv } from "@aprovaai/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";
import { loadConfig } from "./config";

/**
 * Instância única da API por processo (Vercel Function ou `next dev`).
 * Fica em globalThis para sobreviver ao hot reload do Next em desenvolvimento
 * e ser reaproveitada entre requisições na mesma instância (Fluid compute).
 */
const globalForApi = globalThis as typeof globalThis & { __aprovaaiApi?: Promise<FastifyInstance> };

async function createApi(): Promise<FastifyInstance> {
  loadRootEnv();
  const config = loadConfig();
  // Em serverless, poucas conexões por instância; o pooler do Neon multiplexa.
  const { db } = createDb(config.DATABASE_URL, { max: 5 });
  const { app } = await buildApp({ config, db });
  await app.ready();
  return app;
}

export function getApi(): Promise<FastifyInstance> {
  globalForApi.__aprovaaiApi ??= createApi().catch((err: unknown) => {
    // Falha de inicialização (ex.: config inválida) não fica em cache: a próxima requisição tenta de novo.
    globalForApi.__aprovaaiApi = undefined;
    throw err;
  });
  return globalForApi.__aprovaaiApi;
}
