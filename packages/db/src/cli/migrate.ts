// Aplica as migrations pendentes.
// Uso: pnpm db:migrate        → DATABASE_URL
//      pnpm db:migrate --test → DATABASE_URL_TEST
import { loadRootEnv } from "../env";
import { runMigrations } from "../migrate";

loadRootEnv();
const useTest = process.argv.includes("--test");
const varName = useTest ? "DATABASE_URL_TEST" : "DATABASE_URL";
const url = process.env[varName];

if (!url) {
  process.stderr.write(`Variável ${varName} não definida.\n`);
  process.exit(1);
}

runMigrations(url)
  .then(() => process.stdout.write(`Migrations aplicadas (${varName}).\n`))
  .catch((err: unknown) => {
    process.stderr.write(`Falha ao aplicar migrations: ${String(err)}\n`);
    process.exit(1);
  });
