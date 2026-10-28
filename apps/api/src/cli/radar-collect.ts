// Carga do radar para vários dias de uma vez (ex.: primeira execução, ou depois de uma fonte voltar do ar).
// Coleta os dias, processa os documentos novos (regras; IA se ANTHROPIC_API_KEY e flag "ai" ligados) e
// deixa os concursos detectados na fila de Moderação → Radar. Nada é publicado sem o editor.
// Uso: pnpm radar:collect 14      (últimos 14 dias, sem contar hoje)
import { createDb, loadRootEnv, sourceDocuments } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { AnthropicAiProvider } from "../lib/ai/anthropic";
import { DouInlabsConnector } from "../modules/radar/connectors/dou-inlabs";
import { DouPublicoConnector } from "../modules/radar/connectors/dou-publico";
import { QueridoDiarioConnector } from "../modules/radar/connectors/querido-diario";
import { RadarService } from "../modules/radar/service";

const MAX_DAYS = 60;

async function main(): Promise<void> {
  loadRootEnv();
  const days = Number(process.argv[2] ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    process.stderr.write(`Uso: pnpm radar:collect <dias de 1 a ${MAX_DAYS}>\n`);
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Variável DATABASE_URL não definida.");

  const { db, close } = createDb(url, { max: 1 });
  const ai = process.env.ANTHROPIC_API_KEY
    ? new AnthropicAiProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5")
    : null;
  const service = new RadarService(
    db,
    [
      new QueridoDiarioConnector(process.env.QUERIDO_DIARIO_API_URL ?? "https://api.queridodiario.ok.org.br"),
      new DouPublicoConnector(),
      new DouInlabsConnector(process.env.INLABS_EMAIL, process.env.INLABS_PASSWORD),
    ],
    ai,
  );
  try {
    for (let i = days; i >= 1; i--) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const summary = await service.collect(day);
      const line = summary.map((s) => `${s.source}: ${s.status} (${s.found} achados, ${s.created} novos)`);
      process.stdout.write(`${day}  ${line.join(" · ") || "radar desligado"}\n`);
    }
    // Processa direto (sem esperar a fila) os documentos novos coletados acima.
    const pending = await db
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.status, "novo"));
    for (const doc of pending) await service.processDocument(doc.id);
    const leads = await service.listLeads("pendente");
    process.stdout.write(
      `\n${pending.length} documento(s) processado(s); ${leads.length} concurso(s) na fila.\n`,
    );
    for (const lead of leads.slice(0, 30)) {
      process.stdout.write(`  - [${lead.uf ?? "BR"}] ${lead.organization} — ${lead.source.publishedOn}\n`);
    }
  } finally {
    await close();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Falha: ${String(err)}\n`);
  process.exit(1);
});
