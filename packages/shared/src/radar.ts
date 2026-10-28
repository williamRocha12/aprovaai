import { z } from "zod";
import { EXAM_SITUATIONS, SPHERES } from "./catalog";

export const RADAR_SOURCES = ["querido_diario", "dou_inlabs", "dou_publico"] as const;
export const RADAR_SOURCE_LABELS: Record<(typeof RADAR_SOURCES)[number], string> = {
  querido_diario: "Querido Diário (diários municipais)",
  dou_inlabs: "Diário Oficial da União (INLABS)",
  dou_publico: "Diário Oficial da União (leitura pública)",
};
export const LEAD_STATUSES = ["pendente", "confirmado", "descartado"] as const;
export const LEAD_CONFIDENCES = ["alta", "media", "baixa"] as const;

const isoDate = z.iso.date();

const leadPositionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  vacancies: z.number().int().min(1).max(100_000).nullable(),
  salary: z.number().min(0).max(1_000_000).nullable(),
});

/** Concurso detectado pelo radar, como aparece na fila do editor. */
export const examLeadSchema = z.object({
  id: z.uuid(),
  status: z.enum(LEAD_STATUSES),
  organization: z.string(),
  title: z.string(),
  sphere: z.enum(SPHERES),
  uf: z.string().nullable(),
  city: z.string().nullable(),
  boardName: z.string().nullable(),
  positions: z.array(leadPositionSchema),
  registrationStart: z.string().nullable(),
  registrationEnd: z.string().nullable(),
  examDate: z.string().nullable(),
  noticeUrl: z.string().nullable(),
  evidence: z.string(),
  confidence: z.enum(LEAD_CONFIDENCES),
  extractedBy: z.enum(["ia", "regras"]),
  examId: z.uuid().nullable(),
  source: z.object({
    source: z.enum(RADAR_SOURCES),
    url: z.string(),
    title: z.string(),
    publishedOn: z.string(),
  }),
  createdAt: z.string(),
});
export type ExamLead = z.infer<typeof examLeadSchema>;

export const leadListQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).default("pendente"),
  uf: z.string().trim().length(2).toUpperCase().optional(),
});

/** Confirmação pelo editor: dados conferidos na fonte oficial; viram um concurso no catálogo. */
export const confirmLeadSchema = z.object({
  organization: z.string().trim().min(2).max(200),
  title: z.string().trim().min(2).max(200),
  sphere: z.enum(SPHERES),
  uf: z.string().trim().length(2).toUpperCase().nullable(),
  city: z.string().trim().max(100).nullable(),
  boardName: z.string().trim().max(100).nullable(),
  positions: z.array(leadPositionSchema).max(50),
  situation: z.enum(EXAM_SITUATIONS).default("edital_publicado"),
  registrationStart: isoDate.nullable(),
  registrationEnd: isoDate.nullable(),
  examDate: isoDate.nullable(),
  officialUrl: z.url("Informe o link oficial do edital."),
  /** O editor declara que conferiu os dados no documento oficial. Sem isso, nada é publicado. */
  checkedOfficialSource: z.literal(true, "Confirme que conferiu os dados na fonte oficial."),
});
export type ConfirmLeadInput = z.infer<typeof confirmLeadSchema>;

export const radarSourceStatusSchema = z.object({
  source: z.enum(RADAR_SOURCES),
  label: z.string(),
  disabledReason: z.string().nullable(),
  lastRun: z
    .object({
      day: z.string(),
      status: z.enum(["ok", "erro", "desativado"]),
      documentsFound: z.number().int(),
      documentsNew: z.number().int(),
      errorMessage: z.string().nullable(),
      finishedAt: z.string().nullable(),
    })
    .nullable(),
});
export type RadarSourceStatus = z.infer<typeof radarSourceStatusSchema>;

export const radarOverviewSchema = z.object({
  enabled: z.boolean(),
  aiEnabled: z.boolean(),
  sources: z.array(radarSourceStatusSchema),
  pendingLeads: z.number().int(),
});
export type RadarOverview = z.infer<typeof radarOverviewSchema>;
