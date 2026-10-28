import { apiErrorSchema } from "@aprovaai/shared";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth, requireUser } from "../../plugins/auth-context";
import type { AiService } from "./service";

/** Texto extraído do PDF no navegador. ~400 mil caracteres cobre editais grandes (≈100 mil tokens). */
export const MAX_NOTICE_TEXT = 400_000;

const errors = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
  429: apiErrorSchema,
  502: apiErrorSchema,
};
const idParams = z.object({ id: z.uuid() });
// IA custa caro: limite próprio por minuto, além da cota diária por usuário.
const aiRateLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export function registerAiRoutes(app: FastifyInstance, service: AiService): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ["ai"];

  r.post(
    "/api/ai/notice-extract",
    {
      preHandler: requireAuth,
      config: aiRateLimit,
      bodyLimit: 2 * 1_048_576,
      schema: {
        tags,
        body: z.object({
          text: z
            .string()
            .min(200, "Texto curto demais para ser um edital.")
            .max(MAX_NOTICE_TEXT, "Edital grande demais: envie só o conteúdo programático."),
        }),
        response: {
          200: z.object({
            proposal: z.unknown(),
            warnings: z.array(z.string()),
            issues: z.array(z.string()),
          }),
          ...errors,
        },
      },
    },
    async (request) => service.extractNotice(requireUser(request), request.body.text),
  );

  r.post(
    "/api/ai/questions/:id/classify",
    {
      preHandler: requireAuth,
      config: aiRateLimit,
      schema: {
        tags,
        params: idParams,
        response: {
          200: z.object({
            topicId: z.string().nullable(),
            subjectId: z.string().nullable(),
            topicName: z.string().nullable(),
            subjectName: z.string().nullable(),
            confidence: z.enum(["alta", "media", "baixa"]),
            reason: z.string(),
            generatedByAi: z.literal(true),
          }),
          ...errors,
        },
      },
    },
    async (request) => service.classifyQuestion(requireUser(request), request.params.id),
  );

  r.post(
    "/api/ai/questions/:id/explain",
    {
      preHandler: requireAuth,
      config: aiRateLimit,
      schema: {
        tags,
        params: idParams,
        response: {
          200: z.object({
            explanation: z.string(),
            model: z.string(),
            cached: z.boolean(),
            hasEvidence: z.boolean(),
            generatedByAi: z.literal(true),
          }),
          ...errors,
        },
      },
    },
    async (request) => service.explainQuestion(requireUser(request), request.params.id),
  );
}
