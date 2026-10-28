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
}
