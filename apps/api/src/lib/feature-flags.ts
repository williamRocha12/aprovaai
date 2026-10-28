import { featureFlags, type Database } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { AppError } from "./errors";

export async function isFlagEnabled(db: Database, key: string): Promise<boolean> {
  const [flag] = await db
    .select({ enabled: featureFlags.enabled })
    .from(featureFlags)
    .where(eq(featureFlags.key, key));
  return Boolean(flag?.enabled);
}

/** Recurso desligado por flag responde 404 (para o cliente, ele não existe). */
export async function assertFlag(db: Database, key: string, label: string): Promise<void> {
  if (!(await isFlagEnabled(db, key)))
    throw new AppError(404, "NOT_FOUND", `${label} está desativado no momento.`);
}
