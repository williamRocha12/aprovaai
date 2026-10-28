// Camada de IA desacoplada: o resto da API só conhece esta interface.
import { z } from "zod";

/**
 * Schema PLANO pedido ao modelo para o edital (structured outputs não aceita recursão nem
 * limites numéricos em todos os casos). Depois convertemos e validamos com o schema oficial
 * de importação (`noticeImportSchema`).
 */
export const aiNoticeSchema = z.object({
  examTitle: z.string(),
  organizationName: z.string(),
  organizationAcronym: z.string().nullable(),
  sphere: z.enum(["federal", "estadual", "municipal"]),
  uf: z.string().nullable(),
  city: z.string().nullable(),
  boardName: z.string().nullable(),
  positionTitle: z.string().nullable(),
  educationLevel: z.enum(["fundamental", "medio", "superior"]).nullable(),
  noticeTitle: z.string(),
  scoringType: z.enum(["standard", "wrong_cancels_right"]),
  examDate: z.string().nullable(),
  subjects: z.array(
    z.object({
      name: z.string(),
      weight: z.number(),
      questionCount: z.number().nullable(),
      kind: z.enum(["basica", "especifica"]),
      topics: z.array(
        z.object({
          name: z.string(),
          relevance: z.number(),
          rawText: z.string().nullable(),
          subtopics: z.array(z.string()),
        }),
      ),
    }),
  ),
  warnings: z.array(z.string()),
});
export type AiNotice = z.infer<typeof aiNoticeSchema>;

export const aiClassificationSchema = z.object({
  topicId: z.string().nullable(),
  confidence: z.enum(["alta", "media", "baixa"]),
  reason: z.string(),
});
export type AiClassification = z.infer<typeof aiClassificationSchema>;

export const aiExplanationSchema = z.object({
  explanation: z.string(),
  /** O modelo declara quando não tem base para afirmar algo (lei, jurisprudência, gabarito). */
  hasEvidence: z.boolean(),
});
export type AiExplanation = z.infer<typeof aiExplanationSchema>;

export const aiBatchClassificationSchema = z.object({
  items: z.array(
    z.object({
      number: z.number(),
      topicId: z.string().nullable(),
      confidence: z.enum(["alta", "media", "baixa"]),
    }),
  ),
});
export type AiBatchClassification = z.infer<typeof aiBatchClassificationSchema>;

export const aiPlanSummarySchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()),
});
export type AiPlanSummary = z.infer<typeof aiPlanSummarySchema>;

/** Concurso detectado num trecho de diário oficial (radar). Campos ausentes no texto ficam null. */
export const aiExamLeadSchema = z.object({
  isExamOpening: z.boolean(),
  organization: z.string().nullable(),
  title: z.string().nullable(),
  sphere: z.enum(["federal", "estadual", "municipal"]).nullable(),
  uf: z.string().nullable(),
  city: z.string().nullable(),
  boardName: z.string().nullable(),
  positions: z.array(
    z.object({ title: z.string(), vacancies: z.number().nullable(), salary: z.number().nullable() }),
  ),
  registrationStart: z.string().nullable(),
  registrationEnd: z.string().nullable(),
  examDate: z.string().nullable(),
  noticeUrl: z.string().nullable(),
  evidenceQuote: z.string(),
  confidence: z.enum(["alta", "media", "baixa"]),
});
export type AiExamLead = z.infer<typeof aiExamLeadSchema>;

/** Dados agregados (sem nada pessoal) que a IA usa para explicar a estratégia do plano. */
export interface PlanSummaryInput {
  examTitle: string;
  boardName: string | null;
  sample: { exams: number; yearFrom: number | null; yearTo: number | null };
  topBoardTopics: { subjectName: string; topicName: string; sharePercent: number; trend: string | null }[];
  topPriorities: { subjectName: string; topicName: string; justification: string }[];
  phase: string;
  daysToExam: number | null;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type AiResult<T> =
  | { ok: true; data: T; usage: AiUsage }
  | {
      ok: false;
      reason: "refused" | "invalid_output" | "provider_error";
      message: string;
      usage: AiUsage | null;
    };

export interface TaxonomyOption {
  topicId: string;
  subjectName: string;
  topicName: string;
}

export interface QuestionForAi {
  type: "multipla_escolha" | "certo_errado";
  statement: string;
  options: { label: string; text: string }[];
  correctAnswer: string | null;
  board: string | null;
  subjectName: string | null;
  topicName: string | null;
}

export interface AiProvider {
  readonly name: string;
  extractNotice(documentText: string): Promise<AiResult<AiNotice>>;
  classifyQuestion(question: QuestionForAi, taxonomy: TaxonomyOption[]): Promise<AiResult<AiClassification>>;
  explainQuestion(question: QuestionForAi): Promise<AiResult<AiExplanation>>;
  classifyBatch(
    items: (QuestionForAi & { number: number })[],
    taxonomy: TaxonomyOption[],
  ): Promise<AiResult<AiBatchClassification>>;
  planSummary(input: PlanSummaryInput): Promise<AiResult<AiPlanSummary>>;
  extractExamLead(excerpt: string): Promise<AiResult<AiExamLead>>;
}
