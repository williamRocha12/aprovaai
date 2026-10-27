import { featureFlags, type Database } from "@aprovaai/db";
import { LEGAL_DOCS_VERSION } from "@aprovaai/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../../config";

const publicConfigSchema = z.object({
  googleLoginEnabled: z.boolean(),
  legalDocsVersion: z.string(),
});

/** Configuração pública que o web precisa antes do login (ex.: mostrar ou não o botão Google). */
export function registerPublicRoutes(app: FastifyInstance, db: Database, config: AppConfig): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/api/public/config",
    { schema: { tags: ["public"], response: { 200: publicConfigSchema } } },
    async () => {
      const [flag] = await db
        .select({ enabled: featureFlags.enabled })
        .from(featureFlags)
        .where(eq(featureFlags.key, "google_login"));
      return {
        googleLoginEnabled: Boolean(flag?.enabled) && config.googleConfigured,
        legalDocsVersion: LEGAL_DOCS_VERSION,
      };
    },
  );
}
