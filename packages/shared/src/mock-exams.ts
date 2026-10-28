import { z } from "zod";
import { SCORING_TYPES } from "./catalog";

export const createMockExamSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  /** Disciplinas da taxonomia; vazio = todas as disciplinas ativas do plano. */
  subjectIds: z.array(z.uuid()).max(60).default([]),
  questionCount: z.number().int().min(5).max(120),
  timeLimitMin: z.number().int().min(5).max(600).nullable().optional(),
  preferUnanswered: z.boolean().default(true),
});
export type CreateMockExamInput = z.input<typeof createMockExamSchema>;

export const mockExamQuestionSchema = z.object({
  id: z.uuid(),
  order: z.number().int(),
  type: z.enum(["multipla_escolha", "certo_errado"]),
  statement: z.string(),
  options: z.array(z.object({ label: z.string(), text: z.string() })),
  subjectName: z.string().nullable(),
  topicName: z.string().nullable(),
});

export const mockExamSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  questionCount: z.number().int(),
  timeLimitMin: z.number().int().nullable(),
  scoringType: z.enum(SCORING_TYPES),
  wrongPenalty: z.number(),
  createdAt: z.string(),
  lastAttempt: z
    .object({
      id: z.uuid(),
      finished: z.boolean(),
      score: z.number().nullable(),
      maxScore: z.number().nullable(),
    })
    .nullable(),
});
export type MockExamSummary = z.infer<typeof mockExamSummarySchema>;

export const mockExamSessionSchema = z.object({
  attemptId: z.uuid(),
  mockExamId: z.uuid(),
  title: z.string(),
  startedAt: z.string(),
  timeLimitMin: z.number().int().nullable(),
  scoringType: z.enum(SCORING_TYPES),
  wrongPenalty: z.number(),
  questions: z.array(mockExamQuestionSchema),
});
export type MockExamSession = z.infer<typeof mockExamSessionSchema>;

export const finishMockExamSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        answer: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-E]$/)
          .nullable(),
        timeSpentSec: z
          .number()
          .int()
          .min(0)
          .max(6 * 3600)
          .optional(),
      }),
    )
    .max(120),
});

const groupSchema = z.object({ total: z.number(), correct: z.number(), accuracy: z.number().nullable() });

export const mockExamResultSchema = z.object({
  attemptId: z.uuid(),
  mockExamId: z.uuid(),
  title: z.string(),
  finishedAt: z.string(),
  scoringType: z.enum(SCORING_TYPES),
  wrongPenalty: z.number(),
  score: z.number(),
  maxScore: z.number(),
  total: z.number(),
  correct: z.number(),
  wrong: z.number(),
  blank: z.number(),
  accuracy: z.number().nullable(),
  averageTimeSec: z.number().nullable(),
  timeExceeded: z.boolean(),
  bySubject: z.array(
    groupSchema.extend({ subjectId: z.string(), name: z.string(), wrong: z.number(), blank: z.number() }),
  ),
  byTopic: z.array(groupSchema.extend({ topicId: z.string(), name: z.string() })),
  wrongQuestionIds: z.array(z.uuid()),
  recommendations: z.array(z.string()),
});
export type MockExamResult = z.infer<typeof mockExamResultSchema>;
