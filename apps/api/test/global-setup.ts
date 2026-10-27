import { loadRootEnv, runMigrations } from "@aprovaai/db";

/** Aplica as migrations no banco de teste uma vez antes de toda a suíte. */
export default async function setup(): Promise<void> {
  loadRootEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST não definida. Copie o .env.example para .env e suba o Postgres (docker compose up -d).",
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST não pode ser igual a DATABASE_URL: os testes apagam os dados.");
  }
  await runMigrations(url);
}
