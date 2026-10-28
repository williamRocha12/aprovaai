// Radar de editais: coletas em fontes oficiais/abertas, documentos encontrados (dedupe por hash) e concursos
// detectados ("leads") que só entram no catálogo depois da confirmação de um editor na fonte oficial.
import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { users } from "./auth";
import { exams, sphere } from "./catalog";

export const radarSource = pgEnum("radar_source", ["querido_diario", "dou_inlabs", "dou_publico"]);
export const sourceRunStatus = pgEnum("source_run_status", ["ok", "erro", "desativado"]);
export const sourceDocumentStatus = pgEnum("source_document_status", [
  "novo",
  "descartado",
  "processado",
  "erro",
]);
export const examLeadStatus = pgEnum("exam_lead_status", ["pendente", "confirmado", "descartado"]);
export const leadConfidence = pgEnum("lead_confidence", ["alta", "media", "baixa"]);

export interface LeadPositionJson {
  title: string;
  vacancies: number | null;
  salary: number | null;
}

/** Uma execução de um conector para um dia (histórico para o painel de status das fontes). */
export const sourceRuns = pgTable(
  "source_runs",
  {
    id: id(),
    source: radarSource().notNull(),
    day: date().notNull(),
    status: sourceRunStatus().notNull(),
    documentsFound: integer().notNull().default(0),
    documentsNew: integer().notNull().default(0),
    errorMessage: text(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("source_runs_source_idx").on(t.source, t.startedAt)],
);

/** Trecho de diário oficial encontrado por um conector. O hash evita processar a mesma publicação duas vezes. */
export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: id(),
    source: radarSource().notNull(),
    externalId: text().notNull(),
    url: text().notNull(),
    title: text().notNull(),
    publishedOn: date().notNull(),
    territoryName: text(),
    uf: text(),
    /** Só trechos (excerpts) do documento oficial, nunca o diário inteiro. */
    excerpt: text().notNull(),
    contentHash: text().notNull(),
    status: sourceDocumentStatus().notNull().default("novo"),
    errorMessage: text(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("source_documents_hash_unique").on(t.contentHash),
    index("source_documents_status_idx").on(t.status, t.publishedOn),
  ],
);

/** Concurso detectado no radar, aguardando conferência do editor. Nada aqui é exibido como confirmado. */
export const examLeads = pgTable(
  "exam_leads",
  {
    id: id(),
    sourceDocumentId: uuid()
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    status: examLeadStatus().notNull().default("pendente"),
    organization: text().notNull(),
    title: text().notNull(),
    sphere: sphere().notNull(),
    uf: text(),
    city: text(),
    boardName: text(),
    positions: jsonb()
      .$type<LeadPositionJson[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    registrationStart: date(),
    registrationEnd: date(),
    examDate: date(),
    noticeUrl: text(),
    /** Trecho literal do documento que sustenta a detecção (o editor confere com a fonte). */
    evidence: text().notNull(),
    confidence: leadConfidence().notNull(),
    extractedBy: text().$type<"ia" | "regras">().notNull(),
    examId: uuid().references(() => exams.id, { onDelete: "set null" }),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("exam_leads_status_idx").on(t.status, t.createdAt),
    uniqueIndex("exam_leads_document_unique").on(t.sourceDocumentId),
  ],
);
