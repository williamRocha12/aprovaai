// Roda no build da Vercel (script `vercel-build` do web), antes do `next build`.
// - Produção: aplica as migrations no banco de produção.
// - Preview: só aplica com MIGRATE_ON_PREVIEW=true, ou seja, quando a integração do Neon cria um
//   branch de banco por preview. Sem isso, o preview usaria o banco de produção e não pode migrá-lo.
// - Fora da Vercel: não faz nada (em dev use `pnpm db:migrate`).
import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { seedReferenceData } from "../seed";

const env = process.env.VERCEL_ENV;
const shouldMigrate =
  env === "production" || (env === "preview" && process.env.MIGRATE_ON_PREVIEW === "true");

if (!shouldMigrate) {
  process.stdout.write(`Migrations ignoradas (VERCEL_ENV=${env ?? "indefinido"}).\n`);
  process.exit(0);
}

// Migrations usam conexão direta: o pooler (PgBouncer) não segura o lock de migração.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL_UNPOOLED/DATABASE_URL não definida no projeto da Vercel.\n");
  process.exit(1);
}

async function main(databaseUrl: string): Promise<void> {
  await runMigrations(databaseUrl);
  // Dados de referência (feature flags) são idempotentes: não sobrescrevem o que o admin mudou.
  const { db, close } = createDb(databaseUrl, { max: 1 });
  try {
    await seedReferenceData(db);
  } finally {
    await close();
  }
}

main(url)
  .then(() => process.stdout.write(`Migrations e dados de referência aplicados (${env}).\n`))
  .catch((err: unknown) => {
    process.stderr.write(`Falha ao aplicar migrations: ${String(err)}\n`);
    process.exit(1);
  });
