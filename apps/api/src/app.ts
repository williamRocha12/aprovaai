import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { Database } from "@aprovaai/db";
import Fastify from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { createAuth } from "./auth/auth";
import { AnthropicAiProvider } from "./lib/ai/anthropic";
import type { AiProvider } from "./lib/ai/provider";
import type { AppConfig } from "./config";
import { createEmailProvider } from "./lib/email/providers";
import type { EmailProvider } from "./lib/email/types";
import { runJobs, type JobRow } from "./lib/jobs";
import { buildLoggerOptions } from "./lib/logger";
import { registerAdminPlatformRoutes } from "./modules/admin/platform-routes";
import { registerAiPlanSummaryRoute, registerAiRoutes } from "./modules/ai/routes";
import { AiService } from "./modules/ai/service";
import { registerAdminUserRoutes } from "./modules/admin/users-routes";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerCatalogRoutes } from "./modules/catalog/routes";
import { registerHealthRoutes } from "./modules/health/routes";
import { maintenanceCleanup } from "./modules/jobs/maintenance";
import { registerJobRoutes } from "./modules/jobs/routes";
import { registerMeRoutes } from "./modules/me/routes";
import { registerMockExamRoutes } from "./modules/mock-exams/routes";
import { MockExamsService } from "./modules/mock-exams/service";
import { registerModerationRoutes } from "./modules/moderation/routes";
import { DashboardService } from "./modules/dashboard/service";
import { registerPastExamRoutes } from "./modules/past-exams/routes";
import { PastExamsService } from "./modules/past-exams/service";
import { registerPlanRoutes } from "./modules/plan/routes";
import { PlanService } from "./modules/plan/service";
import { registerPrivacyRoutes } from "./modules/privacy/routes";
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
  /** Provedor de IA. undefined = criar pela config (chave presente → Anthropic); null = IA desligada. */
  ai?: AiProvider | null;
}

export async function buildApp({ config, db, email, ai }: AppDeps) {
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
          { name: "mock-exams", description: "Simulados" },
          { name: "moderation", description: "Moderação do catálogo (editor)" },
          { name: "ai", description: "Recursos de IA (propõem; a pessoa confirma)" },
          { name: "past-exams", description: "Provas anteriores e Raio-X da banca" },
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

  const aiProvider =
    ai !== undefined
      ? ai
      : config.ANTHROPIC_API_KEY
        ? new AnthropicAiProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL)
        : null;

  // Provas anteriores alimentam o planejador com a incidência na banca (Raio-X).
  const pastExamsService = new PastExamsService(db, aiProvider);
  const planService = new PlanService(db, createPerformanceProvider(db), (goal, ids) =>
    pastExamsService.incidenceForGoal(goal, ids),
  );
  registerPlanRoutes(app, db, planService);
  const questionsService = new QuestionsService(db);
  registerQuestionRoutes(app, db, questionsService, planService, new DashboardService(db, planService.repo));
  registerMockExamRoutes(app, db, new MockExamsService(db, planService.repo, questionsService));
  registerAdminPlatformRoutes(app, db);
  registerModerationRoutes(app, db);
  registerPrivacyRoutes(app, db);

  const aiService = new AiService(db, config, aiProvider, planService.repo, {
    xrayForGoal: async (goal) => {
      const slug = await pastExamsService.boardSlugForExam(goal.examId);
      return slug ? pastExamsService.xray(slug, {}) : null;
    },
    currentCycle: async (user, goalId) => (await planService.current(user, goalId)).cycle,
  });
  registerAiRoutes(app, aiService);
  registerAiPlanSummaryRoute(app, aiService);

  // Fila de jobs (ADR-010): handlers por tipo; executada pelo cron, pelo admin e após importações.
  const jobHandlers = {
    process_past_exam: (job: JobRow) => pastExamsService.process(String(job.payload.pastExamId)),
    maintenance_cleanup: async () => {
      const removed = await maintenanceCleanup(db);
      app.log.info({ removed }, "manutenção diária concluída");
    },
  };
  const runQueue = (budgetMs: number) => runJobs(db, jobHandlers, app.log, { budgetMs });
  registerPastExamRoutes(app, db, pastExamsService, () => runQueue(50_000));
  registerJobRoutes(app, db, config, runQueue);

  return { app, auth, email: emailProvider };
}
