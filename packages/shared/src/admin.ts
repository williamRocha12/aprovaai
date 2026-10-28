import { z } from "zod";
import { CONTENT_STATUSES } from "./catalog";

export const featureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string(),
  updatedAt: z.string(),
});
export type FeatureFlag = z.infer<typeof featureFlagSchema>;
export const updateFeatureFlagSchema = z.object({ enabled: z.boolean() });

/** Métricas agregadas e anônimas (nenhum dado individual). */
export const adminMetricsSchema = z.object({
  users: z.object({ total: z.number(), verified: z.number(), withGoal: z.number(), disabled: z.number() }),
  activeUsers: z.object({ last7Days: z.number(), last30Days: z.number() }),
  questionsAnswered: z.object({ last7Days: z.number(), last30Days: z.number(), total: z.number() }),
  studyMinutes: z.object({ last7Days: z.number(), last30Days: z.number() }),
  catalog: z.object({
    exams: z.number(),
    drafts: z.number(),
    questions: z.number(),
    openReports: z.number(),
  }),
});
export type AdminMetrics = z.infer<typeof adminMetricsSchema>;

export const REPORT_STATUSES = ["aberto", "aceito", "rejeitado"] as const;

export const questionReportSchema = z.object({
  id: z.uuid(),
  questionId: z.uuid(),
  statementPreview: z.string().nullable(),
  correctAnswer: z.string().nullable(),
  reason: z.string(),
  status: z.enum(REPORT_STATUSES),
  resolution: z.string().nullable(),
  createdAt: z.string(),
  annulled: z.boolean(),
});
export type QuestionReport = z.infer<typeof questionReportSchema>;

export const resolveReportSchema = z.object({
  status: z.enum(["aceito", "rejeitado"]),
  resolution: z.string().trim().min(3).max(2000),
});

/** Correção de questão do catálogo pelo editor (auditada). */
export const editorQuestionPatchSchema = z
  .object({
    annulled: z.boolean().optional(),
    correctAnswer: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-E]$/)
      .optional(),
    explanation: z.string().trim().max(10_000).nullable().optional(),
    contentStatus: z.enum(CONTENT_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nada para atualizar.");

/** Exclusão de conta (LGPD): digitar o e-mail confirma a intenção; senha obrigatória para quem tem senha. */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().toLowerCase(),
  password: z.string().max(128).optional(),
});
