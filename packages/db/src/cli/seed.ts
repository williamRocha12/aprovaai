// Seed idempotente. Os dados de exemplo do catálogo (TRT/FCC) entram na Etapa C.
import { createDb } from "../client";
import { loadRootEnv } from "../env";
import { seedReferenceData } from "../seed";

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("Variável DATABASE_URL não definida.\n");
  process.exit(1);
}

const { db, close } = createDb(url, { max: 1 });
seedReferenceData(db)
  .then(() => process.stdout.write("Seed aplicado.\n"))
  .catch((err: unknown) => {
    process.stderr.write(`Falha no seed: ${String(err)}\n`);
    process.exitCode = 1;
  })
  .finally(() => close());
