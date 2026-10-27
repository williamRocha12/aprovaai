import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>["db"];

/** Cria o client do banco. Quem cria é responsável por chamar `close()`. */
export function createDb(url: string, options: { max?: number } = {}) {
  const sqlClient = postgres(url, {
    max: options.max ?? 10,
    // O pooler do Neon (PgBouncer em modo transação) não suporta prepared statements.
    prepare: false,
    // Conexões ociosas fecham logo: em serverless a instância pode congelar a qualquer momento.
    idle_timeout: 20,
    onnotice: () => {},
  });
  const db = drizzle(sqlClient, { schema, casing: "snake_case" });
  return { db, close: () => sqlClient.end({ timeout: 5 }) };
}
