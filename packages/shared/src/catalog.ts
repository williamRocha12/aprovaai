import { z } from "zod";
import { EDUCATION_LEVELS } from "./users";

export const SPHERES = ["federal", "estadual", "municipal"] as const;
export const EXAM_SITUATIONS = [
  "previsto",
  "autorizado",
  "banca_definida",
  "edital_publicado",
  "encerrado",
] as const;
export const SCORING_TYPES = ["standard", "wrong_cancels_right"] as const;
export const SUBJECT_KINDS = ["basica", "especifica"] as const;
export const CONTENT_STATUSES = ["rascunho", "em_revisao", "validado"] as const;

export const BRAZIL_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
export type BrazilUf = (typeof BRAZIL_UFS)[number];

export const UF_NAMES: Record<BrazilUf, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

/** Estados agrupados por região, na ordem usada na lista de concursos. */
export const BRAZIL_REGIONS: { name: string; ufs: BrazilUf[] }[] = [
  { name: "Sul", ufs: ["PR", "RS", "SC"] },
  { name: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  { name: "Centro-Oeste", ufs: ["DF", "GO", "MS", "MT"] },
  { name: "Nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  { name: "Norte", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
];

/** Contagem de concursos em aberto por estado (`national` = sem UF: federais/nacionais). */
export const openExamCountsSchema = z.object({
  byUf: z.record(z.string(), z.number().int()),
  national: z.number().int(),
  total: z.number().int(),
});
export type OpenExamCounts = z.infer<typeof openExamCountsSchema>;

export const SITUATION_LABELS: Record<(typeof EXAM_SITUATIONS)[number], string> = {
  previsto: "Previsto",
  autorizado: "Autorizado",
  banca_definida: "Banca definida",
  edital_publicado: "Edital publicado",
  encerrado: "Encerrado",
};

const isoDate = z.iso.date();
const trimmed = (max: number) => z.string().trim().min(1).max(max);

const importTopicSchema: z.ZodType<ImportTopic> = z.lazy(() =>
  z.object({
    name: trimmed(200),
    relevance: z.number().int().min(1).max(5).default(3),
    rawText: z.string().trim().max(2000).optional(),
    subtopics: z.array(importTopicSchema).max(50).optional(),
  }),
);
export interface ImportTopic {
  name: string;
  relevance?: number;
  rawText?: string;
  subtopics?: ImportTopic[];
}

/**
 * Formato de importação de edital verticalizado (JSON). Usado pelo editor (catálogo)
 * e pelo usuário (concurso próprio, privado).
 */
export const noticeImportSchema = z.object({
  exam: z.object({
    title: trimmed(200),
    organization: z.object({
      name: trimmed(200),
      acronym: z.string().trim().max(30).optional(),
      sphere: z.enum(SPHERES),
      uf: z.string().trim().length(2).toUpperCase().optional(),
      city: z.string().trim().max(100).optional(),
    }),
    board: z
      .object({
        name: trimmed(100),
        slug: z
          .string()
          .trim()
          .regex(/^[a-z0-9-]+$/)
          .max(50),
      })
      .optional(),
    sphere: z.enum(SPHERES),
    uf: z.string().trim().length(2).toUpperCase().optional(),
    city: z.string().trim().max(100).optional(),
    educationLevel: z.enum(EDUCATION_LEVELS).optional(),
    situation: z.enum(EXAM_SITUATIONS).default("previsto"),
    examDate: isoDate.optional(),
    datesConfirmed: z.boolean().default(false),
    officialUrl: z.url().optional(),
  }),
  position: z
    .object({
      title: trimmed(200),
      educationLevel: z.enum(EDUCATION_LEVELS).optional(),
      vacancies: z.number().int().min(0).optional(),
    })
    .optional(),
  notice: z.object({
    title: trimmed(200),
    version: z.number().int().min(1).default(1),
    publishedAt: isoDate.optional(),
    officialUrl: z.url().optional(),
    scoringType: z.enum(SCORING_TYPES).default("standard"),
    wrongPenalty: z.number().min(0).max(5).default(0),
  }),
  subjects: z
    .array(
      z.object({
        name: trimmed(150),
        weight: z.number().min(0).max(100).default(1),
        questionCount: z.number().int().min(0).max(500).optional(),
        kind: z.enum(SUBJECT_KINDS).default("basica"),
        topics: z.array(importTopicSchema).min(1).max(200),
      }),
    )
    .min(1, "O edital precisa ter ao menos uma disciplina.")
    .max(60),
});
export type NoticeImportInput = z.input<typeof noticeImportSchema>;
export type NoticeImport = z.output<typeof noticeImportSchema>;

// --- Leitura do catálogo ---

export const catalogListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  uf: z.string().trim().length(2).toUpperCase().optional(),
  board: z.string().trim().max(50).optional(),
  situation: z.enum(EXAM_SITUATIONS).optional(),
  /** "Em aberto" = qualquer situação exceto encerrado. */
  open: z.stringbool().optional(),
  /** Com `uf`, inclui também concursos sem UF (federais/nacionais), que valem para qualquer estado. */
  includeNational: z.stringbool().optional(),
  /** Somente concursos sem UF (federais/nacionais). */
  national: z.stringbool().optional(),
  sphere: z.enum(SPHERES).optional(),
  educationLevel: z.enum(EDUCATION_LEVELS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const examSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  organization: z.string(),
  board: z.string().nullable(),
  sphere: z.enum(SPHERES),
  uf: z.string().nullable(),
  situation: z.enum(EXAM_SITUATIONS),
  situationConfirmed: z.boolean(),
  examDate: z.string().nullable(),
  datesConfirmed: z.boolean(),
  isSample: z.boolean(),
  isPrivate: z.boolean(),
  contentStatus: z.enum(CONTENT_STATUSES),
  registrationEnd: z.string().nullable(),
  vacancies: z.number().int().nullable(),
  salaryMax: z.number().nullable(),
  positionCount: z.number().int(),
  /** false = concurso confirmado pelo radar, ainda sem conteúdo programático cadastrado. */
  hasNotice: z.boolean(),
});
export type ExamSummary = z.infer<typeof examSummarySchema>;

const noticeTopicDtoSchema = z.object({
  id: z.uuid(),
  topicId: z.uuid(),
  name: z.string(),
  relevance: z.number().int(),
  rawText: z.string().nullable(),
  parentTopicId: z.uuid().nullable(),
});

export const noticeSubjectDtoSchema = z.object({
  id: z.uuid(),
  subjectId: z.uuid(),
  name: z.string(),
  weight: z.number(),
  questionCount: z.number().int().nullable(),
  kind: z.enum(SUBJECT_KINDS),
  positionId: z.uuid().nullable(),
  topics: z.array(noticeTopicDtoSchema),
});
export type NoticeSubjectDto = z.infer<typeof noticeSubjectDtoSchema>;

export const examDetailSchema = examSummarySchema.extend({
  city: z.string().nullable(),
  officialUrl: z.string().nullable(),
  lastVerifiedAt: z.string().nullable(),
  positions: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      vacancies: z.number().int().nullable(),
      salary: z.number().nullable(),
    }),
  ),
  notice: z
    .object({
      id: z.uuid(),
      title: z.string(),
      version: z.number().int(),
      publishedAt: z.string().nullable(),
      officialUrl: z.string().nullable(),
      scoringType: z.enum(SCORING_TYPES),
      wrongPenalty: z.number(),
      subjects: z.array(noticeSubjectDtoSchema),
    })
    .nullable(),
});
export type ExamDetail = z.infer<typeof examDetailSchema>;

export const updateExamStatusSchema = z.object({
  situation: z.enum(EXAM_SITUATIONS).optional(),
  situationConfirmed: z.boolean().optional(),
  examDate: isoDate.nullable().optional(),
  datesConfirmed: z.boolean().optional(),
  contentStatus: z.enum(CONTENT_STATUSES).optional(),
  officialUrl: z.url().nullable().optional(),
});
