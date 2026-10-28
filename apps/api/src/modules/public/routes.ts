import { featureFlags, type Database } from "@aprovaai/db";
import { LEGAL_DOCS_VERSION } from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../../config";

const publicConfigSchema = z.object({
  googleLoginEnabled: z.boolean(),
  mockExamsEnabled: z.boolean(),
  aiEnabled: z.boolean(),
  legalDocsVersion: z.string(),
});

/** Configuração pública que o web precisa antes do login (ex.: mostrar ou não o botão Google). */
export function registerPublicRoutes(app: FastifyInstance, db: Database, config: AppConfig): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/api/public/config",
    { schema: { tags: ["public"], response: { 200: publicConfigSchema } } },
    async () => {
      const flags = new Map(
        (await db.select({ key: featureFlags.key, enabled: featureFlags.enabled }).from(featureFlags)).map(
          (f) => [f.key, f.enabled],
        ),
      );
      return {
        googleLoginEnabled: Boolean(flags.get("google_login")) && config.googleConfigured,
        mockExamsEnabled: Boolean(flags.get("mock_exams")),
        // IA só fica ativa com a flag E a chave do provedor configurada; sem chave, nunca é simulada.
        aiEnabled: Boolean(flags.get("ai")) && config.aiConfigured,
        legalDocsVersion: LEGAL_DOCS_VERSION,
      };
    },
  );
}
