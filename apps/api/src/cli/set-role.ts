// Define o papel de um usuário existente. Necessário para criar o primeiro admin.
// Uso: pnpm user:set-role voce@exemplo.com admin
import { createDb, loadRootEnv, users } from "@aprovaai/db";
import { userRoleSchema } from "@aprovaai/shared";
import { eq, sql } from "drizzle-orm";
import { AUDIT_ACTIONS, recordAudit } from "../lib/audit";

async function main(): Promise<void> {
  loadRootEnv();
  const [email, roleArg] = process.argv.slice(2);
  const role = userRoleSchema.safeParse(roleArg);
  if (!email || !role.success) {
    process.stderr.write("Uso: pnpm user:set-role <email> <user|editor|admin>\n");
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Variável DATABASE_URL não definida.");

  const { db, close } = createDb(url, { max: 1 });
  try {
    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
    if (!user) {
      process.stderr.write("Usuário não encontrado. Cadastre-se pelo site primeiro.\n");
      process.exitCode = 1;
      return;
    }
    await db.update(users).set({ role: role.data }).where(eq(users.id, user.id));
    await recordAudit(db, {
      action: AUDIT_ACTIONS.ROLE_CHANGED,
      targetType: "user",
      targetId: user.id,
      metadata: { from: user.role, to: role.data, via: "cli" },
    });
    process.stdout.write(`Papel atualizado: ${user.role} → ${role.data}\n`);
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Falha: ${String(err)}\n`);
  process.exit(1);
});
