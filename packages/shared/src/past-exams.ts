import { z } from "zod";

export const PAST_EXAM_STATUSES = ["pendente", "processando", "em_revisao", "processado", "erro"] as const;
export const PAST_EXAM_STATUS_LABELS: Record<(typeof PAST_EXAM_STATUSES)[number], string> = {
  pendente: "Na fila",
  processando: "Processando",
  em_revisao: "Em revisão",
  processado: "Processada",
  erro: "Erro",
};

/** Importação de prova anterior pelo editor: texto da prova e do gabarito (extraídos do PDF oficial) + fonte. */
export const pastExamImportSchema = z.object({
  boardName: z.string().trim().min(2).max(100),
  organization: z.string().trim().min(2).max(200),
  positionTitle: z.string().trim().min(2).max(200),
  year: z.number().int().min(1990).max(2100),
  area: z.string().trim().max(100).optional(),
  sourceUrl: z.url("Informe a URL oficial da prova."),
  answerKeyUrl: z.url().optional(),
  referenceNoticeId: z.uuid().nullable().optional(),
  examText: z.string().min(200, "Texto da prova curto demais.").max(600_000),
  answerKeyText: z.string().max(50_000).default(""),
});
export type PastExamImportInput = z.input<typeof pastExamImportSchema>;

export const pastExamSummarySchema = z.object({
  id: z.uuid(),
  board: z.string(),
  boardSlug: z.string(),
  organization: z.string(),
  positionTitle: z.string(),
  year: z.number().int(),
  area: z.string().nullable(),
  sourceUrl: z.string(),
  answerKeyUrl: z.string().nullable(),
  status: z.enum(PAST_EXAM_STATUSES),
  questionCount: z.number().int(),
  pendingReview: z.number().int(),
  published: z.number().int(),
  createdAt: z.string(),
});
export type PastExamSummary = z.infer<typeof pastExamSummarySchema>;

export const pastExamItemSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  type: z.enum(["multipla_escolha", "certo_errado"]),
  /** Texto integral só aparece para editor ou com a flag past_exam_full_text ligada. */
  statement: z.string().nullable(),
  options: z.array(z.object({ label: z.string(), text: z.string() })),
  correctAnswer: z.string().nullable(),
  annulled: z.boolean(),
  subjectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
  subjectName: z.string().nullable(),
  confidence: z.enum(["alta", "media", "baixa"]).nullable(),
  needsReview: z.boolean(),
  published: z.boolean(),
});
export type PastExamItem = z.infer<typeof pastExamItemSchema>;

export const pastExamDetailSchema = pastExamSummarySchema.extend({
  parseWarnings: z.array(z.string()),
  errorMessage: z.string().nullable(),
  referenceNoticeId: z.uuid().nullable(),
  fullTextVisible: z.boolean(),
  taxonomy: z.array(
    z.object({ subjectId: z.uuid(), subjectName: z.string(), topicId: z.uuid(), topicName: z.string() }),
  ),
  items: z.array(pastExamItemSchema),
});
export type PastExamDetail = z.infer<typeof pastExamDetailSchema>;

export const reviewPastExamItemSchema = z.object({
  subjectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  annulled: z.boolean().optional(),
});

export const boardXraySchema = z.object({
  board: z.object({ slug: z.string(), name: z.string() }),
  filters: z.object({ organization: z.string().nullable(), area: z.string().nullable() }),
  sample: z.object({
    exams: z.number().int(),
    questions: z.number().int(),
    yearFrom: z.number().int().nullable(),
    yearTo: z.number().int().nullable(),
    small: z.boolean(),
  }),
  topics: z.array(
    z.object({
      topicId: z.uuid(),
      topicName: z.string(),
      subjectName: z.string(),
      questionCount: z.number().int(),
      examCount: z.number().int(),
      share: z.number(),
      trend: z.enum(["subindo", "caindo", "estavel"]).nullable(),
    }),
  ),
  style: z.object({
    certoErradoShare: z.number().nullable(),
    averageStatementChars: z.number().nullable(),
    annulledShare: z.number().nullable(),
  }),
});
export type BoardXray = z.infer<typeof boardXraySchema>;
