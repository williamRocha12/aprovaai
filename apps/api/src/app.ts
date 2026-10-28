import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { Database } from "@aprovaai/db";
import Fastify from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { createAuth } from "./auth/auth";
import type { AppConfig } from "./config";
import { createEmailProvider } from "./lib/email/providers";
import type { EmailProvider } from "./lib/email/types";
import { buildLoggerOptions } from "./lib/logger";
import { registerAdminUserRoutes } from "./modules/admin/users-routes";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerCatalogRoutes } from "./modules/catalog/routes";
import { registerHealthRoutes } from "./modules/health/routes";
import { registerMeRoutes } from "./modules/me/routes";
import { DashboardService } from "./modules/dashboard/service";
import { registerPlanRoutes } from "./modules/plan/routes";
import { PlanService } from "./modules/plan/service";
import { registerPublicRoutes } from "./modules/public/routes";
import { createPerformanceProvider } from "./modules/questions/performance";
import { registerQuestionRoutes } from "./modules/questions/routes";
import { QuestionsService } from "./modules/questions/service";
import { registerAuthContext } from "./plugins/auth-context";
import { registerErrorHandler } from "./plugins/error-handler";
import { registerSecurity } from "./plugins/security";

export interface AppDeps {
  config: AppConfig;
  db: Database;
  /** Injetável nos testes (MemoryEmailProvider). */
  email?: EmailProvider;
}

export async function buildApp({ config, db, email }: AppDeps) {
  const app = Fastify({
    logger: buildLoggerOptions(config),
    // Não confiamos em X-Forwarded-For genérico. O IP real vem só do header configurado em
    // CLIENT_IP_HEADER (na Vercel, x-real-ip, definido pela borda). Ver plugins/security.ts.
    trustProxy: false,
    bodyLimit: 1_048_576, // 1 MiB; upload de arquivos terá rota própria
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  if (config.apiDocsEnabled) {
    await app.register(swagger, {
      openapi: {
        info: { title: "AprovaAI API", version: "0.1.0", description: "API REST do AprovaAI." },
        tags: [
          { name: "health", description: "Liveness e readiness" },
          { name: "me", description: "Dados do usuário logado" },
          { name: "admin", description: "Administração (papel admin)" },
          { name: "public", description: "Configuração pública" },
          { name: "catalog", description: "Concursos, editais e importação" },
          { name: "plan", description: "Objetivo, ciclo de estudos, tarefas e sessões" },
          { name: "questions", description: "Questões, tentativas, revisões e caderno de erros" },
          { name: "dashboard", description: "Métricas do usuário" },
        ],
      },
      transform: jsonSchemaTransform,
    });
    // Tudo sob /api: no Vercel a API roda dentro do Next pela rota app/api/[...path].
    await app.register(swaggerUi, { routePrefix: "/api/docs" });
  }

  await registerSecurity(app, config);

  const emailProvider = email ?? createEmailProvider(config);
  const auth = createAuth({ config, db, email: emailProvider, logger: app.log });
  registerAuthContext(app, auth, db);

  registerHealthRoutes(app, db);
  registerAuthRoutes(app, auth, config.APP_URL);
  registerPublicRoutes(app, db, config);
  registerMeRoutes(app, db);
  registerAdminUserRoutes(app, db);
  registerCatalogRoutes(app, db);
  const planService = new PlanService(db, createPerformanceProvider(db));
  registerPlanRoutes(app, db, planService);
  registerQuestionRoutes(
    app,
    db,
    new QuestionsService(db),
    planService,
    new DashboardService(db, planService.repo),
  );

  return { app, auth, email: emailProvider };
}
