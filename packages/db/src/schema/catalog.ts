// Catálogo compartilhado (concursos, editais, taxonomia). owner_user_id NULL = catálogo público;
// preenchido = conteúdo privado do usuário (concurso/edital próprio que ainda não está no catálogo).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { educationLevel } from "./account";
import { users } from "./auth";

export const sphere = pgEnum("sphere", ["federal", "estadual", "municipal"]);
export const examSituation = pgEnum("exam_situation", [
  "previsto",
  "autorizado",
  "banca_definida",
  "edital_publicado",
  "encerrado",
]);
export const contentStatus = pgEnum("content_status", ["rascunho", "em_revisao", "validado"]);
export const contentOrigin = pgEnum("content_origin", ["oficial", "autoral", "usuario", "gerado_por_ia"]);
export const scoringType = pgEnum("scoring_type", ["standard", "wrong_cancels_right"]);
export const subjectKind = pgEnum("subject_kind", ["basica", "especifica"]);

/** Campos de procedência comuns a todo conteúdo do catálogo. */
const provenance = {
  contentStatus: contentStatus().notNull().default("rascunho"),
  contentOrigin: contentOrigin().notNull().default("autoral"),
  sourceUrl: text(),
  /** Dado de exemplo: marcado na UI e removível por comando. */
  isSample: boolean().notNull().default(false),
};

export const boards = pgTable("boards", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  ...timestamps,
});

export const organizations = pgTable("organizations", {
  id: id(),
  name: text().notNull(),
  acronym: text(),
  sphere: sphere().notNull(),
  uf: text(),
  city: text(),
  ...timestamps,
});

export const exams = pgTable(
  "exams",
  {
    id: id(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    boardId: uuid().references(() => boards.id),
    title: text().notNull(),
    sphere: sphere().notNull(),
    uf: text(),
    city: text(),
    educationLevel: educationLevel(),
    situation: examSituation().notNull().default("previsto"),
    /** Datas e situação só aparecem como confirmadas com fonte oficial. */
    situationConfirmed: boolean().notNull().default(false),
    noticeDate: date(),
    registrationStart: date(),
    registrationEnd: date(),
    examDate: date(),
    datesConfirmed: boolean().notNull().default(false),
    officialUrl: text(),
    lastVerifiedAt: timestamp({ withTimezone: true }),
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    ...provenance,
    ...timestamps,
  },
  (t) => [
    index("exams_catalog_idx")
      .on(t.situation, t.uf, t.boardId)
      .where(sql`${t.ownerUserId} IS NULL`),
    index("exams_owner_idx").on(t.ownerUserId),
  ],
);

export const examPositions = pgTable("exam_positions", {
  id: id(),
  examId: uuid()
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  title: text().notNull(),
  educationLevel: educationLevel(),
  salary: numeric({ precision: 12, scale: 2 }),
  salaryConfirmed: boolean().notNull().default(false),
  vacancies: integer(),
  ...timestamps,
});

/** Versão de um edital. Regra de pontuação fica aqui (cada edital define a sua). */
export const examNotices = pgTable(
  "exam_notices",
  {
    id: id(),
    examId: uuid()
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    version: integer().notNull().default(1),
    title: text().notNull(),
    publishedAt: date(),
    officialUrl: text(),
    isCurrent: boolean().notNull().default(true),
    scoringType: scoringType().notNull().default("standard"),
    /** Quantas certas cada errada anula (Cebraspe = 1). */
    wrongPenalty: numeric({ precision: 4, scale: 2, mode: "number" }).notNull().default(0),
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    ...provenance,
    ...timestamps,
  },
  (t) => [uniqueIndex("exam_notices_version_unique").on(t.examId, t.version)],
);

/** Taxonomia global: disciplinas. */
export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull(),
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("subjects_slug_catalog_unique")
      .on(t.slug)
      .where(sql`${t.ownerUserId} IS NULL`),
    uniqueIndex("subjects_slug_owner_unique")
      .on(t.slug, t.ownerUserId)
      .where(sql`${t.ownerUserId} IS NOT NULL`),
  ],
);

/** Taxonomia global: assuntos e subassuntos (parent_topic_id). */
export const topics = pgTable(
  "topics",
  {
    id: id(),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    parentTopicId: uuid().references((): AnyPgColumn => topics.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull(),
    ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    index("topics_subject_idx").on(t.subjectId),
    uniqueIndex("topics_slug_catalog_unique")
      .on(t.subjectId, t.parentTopicId, t.slug)
      .where(sql`${t.ownerUserId} IS NULL`),
    uniqueIndex("topics_slug_owner_unique")
      .on(t.subjectId, t.parentTopicId, t.slug, t.ownerUserId)
      .where(sql`${t.ownerUserId} IS NOT NULL`),
  ],
);

/** O que um edital cobra de cada disciplina. position_id NULL = comum a todos os cargos. */
export const noticeSubjects = pgTable(
  "notice_subjects",
  {
    id: id(),
    noticeId: uuid()
      .notNull()
      .references(() => examNotices.id, { onDelete: "cascade" }),
    positionId: uuid().references(() => examPositions.id, { onDelete: "cascade" }),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id),
    weight: numeric({ precision: 6, scale: 2, mode: "number" }).notNull().default(1),
    questionCount: integer(),
    kind: subjectKind().notNull().default("basica"),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("notice_subjects_notice_idx").on(t.noticeId),
    check("notice_subjects_weight_non_negative", sql`${t.weight} >= 0`),
    check(
      "notice_subjects_question_count_non_negative",
      sql`${t.questionCount} IS NULL OR ${t.questionCount} >= 0`,
    ),
  ],
);

export const noticeTopics = pgTable(
  "notice_topics",
  {
    id: id(),
    noticeSubjectId: uuid()
      .notNull()
      .references(() => noticeSubjects.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id),
    relevance: integer().notNull().default(3),
    /** Texto literal do edital para este item. */
    rawText: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("notice_topics_subject_idx").on(t.noticeSubjectId),
    check("notice_topics_relevance_range", sql`${t.relevance} BETWEEN 1 AND 5`),
  ],
);
