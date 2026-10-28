// Liga/desliga uma feature flag existente (o painel de flags chega na Etapa E).
// Uso: pnpm feature:set google_login on
import { createDb, featureFlags, loadRootEnv } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { AUDIT_ACTIONS, recordAudit } from "../lib/audit";

const STATES: Record<string, boolean> = { on: true, off: false, true: true, false: false };

async function main(): Promise<void> {
  loadRootEnv();
  const [key, stateArg] = process.argv.slice(2);
  const enabled = stateArg === undefined ? undefined : STATES[stateArg];
  if (!key || enabled === undefined) {
    process.stderr.write("Uso: pnpm feature:set <chave> <on|off>\n");
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Variável DATABASE_URL não definida.");

  const { db, close } = createDb(url, { max: 1 });
  try {
    const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key));
    if (!flag) {
      const keys = (await db.select({ key: featureFlags.key }).from(featureFlags)).map((f) => f.key);
      process.stderr.write(`Flag "${key}" não existe. Disponíveis: ${keys.join(", ")}\n`);
      process.exitCode = 1;
      return;
    }
    await db.update(featureFlags).set({ enabled }).where(eq(featureFlags.key, key));
    await recordAudit(db, {
      action: AUDIT_ACTIONS.FEATURE_FLAG_CHANGED,
      targetType: "feature_flag",
      targetId: key,
      metadata: { from: flag.enabled, to: enabled, via: "cli" },
    });
    process.stdout.write(`Flag ${key}: ${flag.enabled ? "on" : "off"} → ${enabled ? "on" : "off"}\n`);
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Falha: ${String(err)}\n`);
  process.exit(1);
});
