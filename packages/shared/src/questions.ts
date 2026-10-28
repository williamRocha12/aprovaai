import { z } from "zod";

export const QUESTION_TYPES = ["multipla_escolha", "certo_errado"] as const;
export const ERROR_TYPES = [
  "falta_de_teoria",
  "pegadinha_da_banca",
  "falta_de_atencao",
  "interpretacao",
  "chute",
  "esquecimento",
] as const;
export type ErrorTypeValue = (typeof ERROR_TYPES)[number];

export const ERROR_TYPE_LABELS: Record<ErrorTypeValue, string> = {
  falta_de_teoria: "Falta de teoria",
  pegadinha_da_banca: "Pegadinha da banca",
  falta_de_atencao: "Falta de atenção",
  interpretacao: "Interpretação",
  chute: "Chute",
  esquecimento: "Esquecimento",
};

export const ATTEMPT_CONTEXTS = ["avulsa", "revisao", "simulado", "registro_externo"] as const;
export const REVIEW_BUCKETS = ["hoje", "atrasada", "futura", "concluida"] as const;

const answerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-E]$/, "Resposta deve ser uma letra de A a E (ou C/E no certo/errado).");

export const questionFiltersSchema = z.object({
  subjectId: z.uuid().optional(),
  topicId: z.uuid().optional(),
  board: z.string().trim().max(50).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  status: z.enum(["todas", "nao_respondidas", "erradas", "favoritas"]).default("todas"),
  scope: z.enum(["todas", "catalogo", "minhas"]).default("todas"),
  listId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type QuestionFilters = z.input<typeof questionFiltersSchema>;

export const questionSummarySchema = z.object({
  id: z.uuid(),
  type: z.enum(QUESTION_TYPES),
  statementPreview: z.string().nullable(),
  board: z.string().nullable(),
  organization: z.string().nullable(),
  year: z.number().int().nullable(),
  subjectName: z.string().nullable(),
  topicName: z.string().nullable(),
  isPrivate: z.boolean(),
  isSample: z.boolean(),
  attempts: z.number().int(),
  lastCorrect: z.boolean().nullable(),
  isFavorite: z.boolean(),
});
export type QuestionSummary = z.infer<typeof questionSummarySchema>;

export const attemptDtoSchema = z.object({
  id: z.uuid(),
  answer: z.string().nullable(),
  isCorrect: z.boolean(),
  errorType: z.enum(ERROR_TYPES).nullable(),
  timeSpentSec: z.number().int().nullable(),
  context: z.enum(ATTEMPT_CONTEXTS),
  answeredAt: z.string(),
});
export type AttemptDto = z.infer<typeof attemptDtoSchema>;

export const questionDetailSchema = questionSummarySchema.extend({
  statement: z.string().nullable(),
  options: z.array(z.object({ label: z.string(), text: z.string() })),
  difficulty: z.number().int().nullable(),
  sourceUrl: z.string().nullable(),
  externalSource: z.string().nullable(),
  annulled: z.boolean(),
  /** Gabarito e explicação só aparecem depois que o usuário respondeu ao menos uma vez. */
  correctAnswer: z.string().nullable(),
  explanation: z.string().nullable(),
  explanationOrigin: z.enum(["oficial", "autoral", "gerado_por_ia"]).nullable(),
  revealed: z.boolean(),
  note: z.string().nullable(),
  history: z.array(attemptDtoSchema),
  review: z
    .object({ stage: z.number().int(), dueDate: z.string(), status: z.enum(["ativa", "dominada"]) })
    .nullable(),
});
export type QuestionDetail = z.infer<typeof questionDetailSchema>;

export const attemptInputSchema = z.object({
  answer: answerSchema,
  timeSpentSec: z
    .number()
    .int()
    .min(0)
    .max(6 * 3600)
    .optional(),
  context: z.enum(["avulsa", "revisao"]).default("avulsa"),
  idempotencyKey: z.string().min(8).max(100),
});

export const attemptResultSchema = z.object({
  attempt: attemptDtoSchema,
  correctAnswer: z.string().nullable(),
  explanation: z.string().nullable(),
  review: z
    .object({ stage: z.number().int(), dueDate: z.string(), status: z.enum(["ativa", "dominada"]) })
    .nullable(),
});

export const classifyAttemptSchema = z.object({ errorType: z.enum(ERROR_TYPES) });

const questionMetaSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  subjectId: z.uuid().nullable().optional(),
  topicId: z.uuid().nullable().optional(),
  board: z.string().trim().max(100).optional(),
  organization: z.string().trim().max(200).optional(),
  year: z.number().int().min(1990).max(2100).optional(),
});

/** Questão pessoal completa (enunciado, alternativas, gabarito). */
export const personalQuestionSchema = questionMetaSchema
  .extend({
    statement: z.string().trim().min(5).max(10_000),
    options: z
      .array(z.object({ label: answerSchema, text: z.string().trim().min(1).max(2000) }))
      .max(5)
      .default([]),
    correctAnswer: answerSchema,
    explanation: z.string().trim().max(10_000).optional(),
    sourceUrl: z.url().optional(),
  })
  .refine((q) => q.type === "certo_errado" || q.options.length >= 2, {
    message: "Questão de múltipla escolha precisa de ao menos 2 alternativas.",
    path: ["options"],
  })
  .refine((q) => q.type !== "certo_errado" || ["C", "E"].includes(q.correctAnswer), {
    message: "No certo/errado o gabarito é C ou E.",
    path: ["correctAnswer"],
  })
  .refine((q) => q.type === "certo_errado" || q.options.some((o) => o.label === q.correctAnswer), {
    message: "O gabarito precisa ser uma das alternativas.",
    path: ["correctAnswer"],
  });

/**
 * Cadastro rápido de questão resolvida em outra plataforma: só metadados, minha resposta
 * e se acertei (sem copiar o enunciado de terceiros).
 */
export const quickRegisterSchema = questionMetaSchema.extend({
  externalSource: z.string().trim().max(100).optional(),
  reference: z.string().trim().max(300).optional(),
  myAnswer: answerSchema.optional(),
  isCorrect: z.boolean(),
  errorType: z.enum(ERROR_TYPES).nullable().optional(),
  timeSpentSec: z
    .number()
    .int()
    .min(0)
    .max(6 * 3600)
    .optional(),
});

export const noteInputSchema = z.object({ body: z.string().trim().max(5000) });
export const reportInputSchema = z.object({ reason: z.string().trim().min(10).max(2000) });

export const reviewItemDtoSchema = z.object({
  id: z.uuid(),
  questionId: z.uuid(),
  stage: z.number().int(),
  dueDate: z.string(),
  status: z.enum(["ativa", "dominada"]),
  bucket: z.enum(REVIEW_BUCKETS),
  statementPreview: z.string().nullable(),
  subjectName: z.string().nullable(),
  topicName: z.string().nullable(),
  lastErrorType: z.enum(ERROR_TYPES).nullable(),
});
export type ReviewItemDto = z.infer<typeof reviewItemDtoSchema>;

export const reviewsResponseSchema = z.object({
  counts: z.object({ hoje: z.number(), atrasada: z.number(), futura: z.number(), concluida: z.number() }),
  items: z.array(reviewItemDtoSchema),
});

export const errorNotebookEntrySchema = z.object({
  questionId: z.uuid(),
  statementPreview: z.string().nullable(),
  subjectName: z.string().nullable(),
  topicName: z.string().nullable(),
  board: z.string().nullable(),
  wrongCount: z.number().int(),
  lastWrongAt: z.string(),
  lastErrorType: z.enum(ERROR_TYPES).nullable(),
  review: z
    .object({ stage: z.number().int(), dueDate: z.string(), status: z.enum(["ativa", "dominada"]) })
    .nullable(),
});
export type ErrorNotebookEntry = z.infer<typeof errorNotebookEntrySchema>;

export const errorNotebookResponseSchema = z.object({
  distribution: z.array(z.object({ errorType: z.enum(ERROR_TYPES).nullable(), count: z.number().int() })),
  entries: z.array(errorNotebookEntrySchema),
});

export const questionListSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isFavorites: z.boolean(),
  count: z.number().int(),
});
export const listInputSchema = z.object({ name: z.string().trim().min(2).max(80) });

export const dashboardSchema = z.object({
  isSample: z.boolean(),
  examTitle: z.string().nullable(),
  daysToExam: z.number().int().nullable(),
  week: z.object({
    netMinutes: z.number().int(),
    plannedMinutes: z.number().int(),
    completedMinutes: z.number().int(),
  }),
  streakDays: z.number().int(),
  questions: z.object({
    answered: z.number().int(),
    correct: z.number().int(),
    accuracy: z.number().nullable(),
  }),
  weekly: z.array(
    z.object({
      weekStart: z.string(),
      answered: z.number().int(),
      correct: z.number().int(),
      accuracy: z.number().nullable(),
    }),
  ),
  bySubject: z.array(
    z.object({
      name: z.string(),
      answered: z.number().int(),
      correct: z.number().int(),
      accuracy: z.number().nullable(),
    }),
  ),
  worstTopics: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      subjectName: z.string(),
      answered: z.number().int(),
      accuracy: z.number(),
    }),
  ),
  errorDistribution: z.array(z.object({ errorType: z.enum(ERROR_TYPES), count: z.number().int() })),
  coverage: z.object({ covered: z.number().int(), total: z.number().int() }),
  reviews: z.object({ today: z.number().int(), overdue: z.number().int() }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
