// Importação de edital verticalizado. A taxonomia (disciplinas/assuntos) é reaproveitada pelo slug:
// "Atos administrativos" de dois editais diferentes apontam para o mesmo assunto global.
import type { ImportTopic, NoticeImport } from "@aprovaai/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  boards,
  examNotices,
  examPositions,
  exams,
  noticeSubjects,
  noticeTopics,
  organizations,
  subjects,
  topics,
} from "./schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ImportOptions {
  /** null = catálogo público (editor); id = concurso privado do usuário. */
  ownerUserId: string | null;
  contentStatus: "rascunho" | "em_revisao" | "validado";
  contentOrigin: "oficial" | "autoral" | "usuario" | "gerado_por_ia";
  isSample?: boolean;
}

export interface ImportResult {
  examId: string;
  noticeId: string;
  positionId: string | null;
  subjects: number;
  topics: number;
}

/** "Direito Administrativo" → "direito-administrativo". */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function findOrCreateSubject(tx: Tx, name: string, ownerUserId: string | null): Promise<string> {
  const slug = slugify(name);
  // Primeiro a taxonomia do catálogo; depois a privada do próprio usuário.
  const [catalog] = await tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(and(eq(subjects.slug, slug), isNull(subjects.ownerUserId)));
  if (catalog) return catalog.id;
  if (ownerUserId) {
    const [own] = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.slug, slug), eq(subjects.ownerUserId, ownerUserId)));
    if (own) return own.id;
  }
  const [created] = await tx
    .insert(subjects)
    .values({ name, slug, ownerUserId })
    .returning({ id: subjects.id });
  if (!created) throw new Error("Falha ao criar disciplina.");
  return created.id;
}

async function findOrCreateTopic(
  tx: Tx,
  subjectId: string,
  parentTopicId: string | null,
  name: string,
  ownerUserId: string | null,
): Promise<string> {
  const slug = slugify(name);
  const parentCondition = parentTopicId
    ? eq(topics.parentTopicId, parentTopicId)
    : isNull(topics.parentTopicId);
  const [catalog] = await tx
    .select({ id: topics.id })
    .from(topics)
    .where(
      and(
        eq(topics.subjectId, subjectId),
        parentCondition,
        eq(topics.slug, slug),
        isNull(topics.ownerUserId),
      ),
    );
  if (catalog) return catalog.id;
  if (ownerUserId) {
    const [own] = await tx
      .select({ id: topics.id })
      .from(topics)
      .where(
        and(
          eq(topics.subjectId, subjectId),
          parentCondition,
          eq(topics.slug, slug),
          eq(topics.ownerUserId, ownerUserId),
        ),
      );
    if (own) return own.id;
  }
  const [created] = await tx
    .insert(topics)
    .values({ subjectId, parentTopicId, name, slug, ownerUserId })
    .returning({ id: topics.id });
  if (!created) throw new Error("Falha ao criar assunto.");
  return created.id;
}

export async function importNotice(
  db: Database,
  data: NoticeImport,
  options: ImportOptions,
): Promise<ImportResult> {
  const { ownerUserId } = options;
  const provenance = {
    contentStatus: options.contentStatus,
    contentOrigin: options.contentOrigin,
    isSample: options.isSample ?? false,
  };

  return db.transaction(async (tx) => {
    let boardId: string | null = null;
    if (data.exam.board) {
      const [board] = await tx
        .insert(boards)
        .values({ name: data.exam.board.name, slug: data.exam.board.slug })
        .onConflictDoUpdate({ target: boards.slug, set: { name: sql`${boards.name}` } })
        .returning({ id: boards.id });
      boardId = board?.id ?? null;
    }

    const org = data.exam.organization;
    const [existingOrg] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(
          eq(organizations.name, org.name),
          org.uf ? eq(organizations.uf, org.uf) : isNull(organizations.uf),
        ),
      );
    const organizationId =
      existingOrg?.id ??
      (
        await tx
          .insert(organizations)
          .values({ name: org.name, acronym: org.acronym, sphere: org.sphere, uf: org.uf, city: org.city })
          .returning({ id: organizations.id })
      )[0]?.id;
    if (!organizationId) throw new Error("Falha ao criar órgão.");

    const [exam] = await tx
      .insert(exams)
      .values({
        organizationId,
        boardId,
        title: data.exam.title,
        sphere: data.exam.sphere,
        uf: data.exam.uf,
        city: data.exam.city,
        educationLevel: data.exam.educationLevel,
        situation: data.exam.situation,
        examDate: data.exam.examDate,
        datesConfirmed: data.exam.datesConfirmed,
        officialUrl: data.exam.officialUrl,
        sourceUrl: data.exam.officialUrl,
        ownerUserId,
        ...provenance,
      })
      .returning({ id: exams.id });
    if (!exam) throw new Error("Falha ao criar concurso.");

    let positionId: string | null = null;
    if (data.position) {
      const [position] = await tx
        .insert(examPositions)
        .values({
          examId: exam.id,
          title: data.position.title,
          educationLevel: data.position.educationLevel,
          vacancies: data.position.vacancies,
        })
        .returning({ id: examPositions.id });
      positionId = position?.id ?? null;
    }

    const [notice] = await tx
      .insert(examNotices)
      .values({
        examId: exam.id,
        version: data.notice.version,
        title: data.notice.title,
        publishedAt: data.notice.publishedAt,
        officialUrl: data.notice.officialUrl,
        sourceUrl: data.notice.officialUrl,
        scoringType: data.notice.scoringType,
        wrongPenalty: data.notice.wrongPenalty,
        ownerUserId,
        ...provenance,
      })
      .returning({ id: examNotices.id });
    if (!notice) throw new Error("Falha ao criar edital.");

    let topicCount = 0;
    const insertTopics = async (
      list: ImportTopic[],
      noticeSubjectId: string,
      subjectId: string,
      parentTopicId: string | null,
    ) => {
      for (const [index, item] of list.entries()) {
        const topicId = await findOrCreateTopic(tx, subjectId, parentTopicId, item.name, ownerUserId);
        await tx.insert(noticeTopics).values({
          noticeSubjectId,
          topicId,
          relevance: item.relevance ?? 3,
          rawText: item.rawText,
          sortOrder: topicCount + index,
        });
        topicCount++;
        if (item.subtopics?.length) await insertTopics(item.subtopics, noticeSubjectId, subjectId, topicId);
      }
    };

    for (const [index, subject] of data.subjects.entries()) {
      const subjectId = await findOrCreateSubject(tx, subject.name, ownerUserId);
      const [noticeSubject] = await tx
        .insert(noticeSubjects)
        .values({
          noticeId: notice.id,
          positionId,
          subjectId,
          weight: subject.weight,
          questionCount: subject.questionCount,
          kind: subject.kind,
          sortOrder: index,
        })
        .returning({ id: noticeSubjects.id });
      if (!noticeSubject) throw new Error("Falha ao vincular disciplina.");
      await insertTopics(subject.topics, noticeSubject.id, subjectId, null);
    }

    return {
      examId: exam.id,
      noticeId: notice.id,
      positionId,
      subjects: data.subjects.length,
      topics: topicCount,
    };
  });
}
