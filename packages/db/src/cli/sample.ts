// Dados de exemplo do catálogo.
// Uso: pnpm db:sample          → cria o concurso de exemplo (TRT/FCC)
//      pnpm db:sample:remove   → remove (use --force se houver planos de usuários em cima dele)
import { createDb } from "../client";
import { loadRootEnv } from "../env";
import { removeSampleData, seedSampleData } from "../sample";

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("Variável DATABASE_URL não definida.\n");
  process.exit(1);
}

const remove = process.argv.includes("--remove");
const force = process.argv.includes("--force");
const { db, close } = createDb(url, { max: 1 });

const run = async () => {
  if (remove) {
    const result = await removeSampleData(db, force);
    process.stdout.write(`Exemplos removidos: ${result.exams} concurso(s), ${result.goals} plano(s).\n`);
  } else {
    const result = await seedSampleData(db);
    process.stdout.write(
      result === "created" ? "Concurso de exemplo criado.\n" : "Concurso de exemplo já existe.\n",
    );
  }
};

run()
  .catch((err: unknown) => {
    process.stderr.write(`Falha: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => close());
