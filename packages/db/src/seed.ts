import type { Database } from "./client";
import { featureFlags } from "./schema";

export const DEFAULT_FEATURE_FLAGS = [
  { key: "google_login", description: "Login social com Google", enabled: false },
  { key: "ai", description: "Recursos de IA (importação de edital, explicações)", enabled: false },
  { key: "mock_exams", description: "Simulados", enabled: true },
  { key: "past_exam_full_text", description: "Exibir texto integral de provas anteriores", enabled: false },
  { key: "radar", description: "Radar de editais (coleta diária em diários oficiais)", enabled: true },
] as const;

/** Dados de referência obrigatórios. Idempotente: não sobrescreve flags já alteradas pelo admin. */
export async function seedReferenceData(db: Database): Promise<void> {
  await db
    .insert(featureFlags)
    .values(DEFAULT_FEATURE_FLAGS.map((f) => ({ ...f })))
    .onConflictDoNothing();
}
