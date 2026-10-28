// Provas anteriores (fonte oficial) e seus itens, base do Raio-X da banca.
// O texto fica guardado para processamento e estatística; exibir ao usuário depende da flag past_exam_full_text.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { boards, examNotices, subjects, topics } from "./catalog";
import { questionType, questions } from "./questions";

export const pastExamStatus = pgEnum("past_exam_status", [
  "pendente",
  "processando",
  "em_revisao",
  "processado",
  "erro",
]);
export const classificationConfidence = pgEnum("classification_confidence", ["alta", "media", "baixa"]);

export const pastExams = pgTable(
  "past_exams",
  {
    id: id(),
    boardId: uuid()
      .notNull()
      .references(() => boards.id),
    organization: text().notNull(),
    positionTitle: text().notNull(),
    year: integer().notNull(),
    area: text(),
    /** URL oficial da prova (obrigatória: sem fonte, não entra). */
    sourceUrl: text().notNull(),
    answerKeyUrl: text(),
    /** Edital cujos assuntos servem de referência para classificar as questões. */
    referenceNoticeId: uuid().references(() => examNotices.id, { onDelete: "set null" }),
    /** Hash do texto da prova: deduplica reenvios do mesmo documento. */
    contentHash: text().notNull(),
    examText: text().notNull(),
    answerKeyText: text().notNull().default(""),
    status: pastExamStatus().notNull().default("pendente"),
    parseWarnings: jsonb().$type<string[]>().notNull().default([]),
    errorMessage: text(),
    uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("past_exams_hash_unique").on(t.contentHash),
    index("past_exams_board_idx").on(t.boardId, t.year),
    check("past_exams_year_range", sql`${t.year} BETWEEN 1990 AND 2100`),
  ],
);

export const pastExamQuestions = pgTable(
  "past_exam_questions",
  {
    id: id(),
    pastExamId: uuid()
      .notNull()
      .references(() => pastExams.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    type: questionType().notNull(),
    statement: text().notNull(),
    options: jsonb().$type<{ label: string; text: string }[]>().notNull().default([]),
    correctAnswer: text(),
    annulled: boolean().notNull().default(false),
    subjectId: uuid().references(() => subjects.id),
    topicId: uuid().references(() => topics.id),
    confidence: classificationConfidence(),
    /** true até um humano conferir a classificação; estatística só usa itens revisados. */
    needsReview: boolean().notNull().default(true),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Preenchido quando o item é publicado no banco de questões (flag past_exam_full_text). */
    questionId: uuid().references(() => questions.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("past_exam_questions_number_unique").on(t.pastExamId, t.number),
    index("past_exam_questions_topic_idx").on(t.topicId),
  ],
);
