import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

/** Pasta das migrations SQL geradas pelo drizzle-kit (sobrescrevível em build/Docker). */
export const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
