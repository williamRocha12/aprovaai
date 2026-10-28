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
  type Database,
} from "@aprovaai/db";
import type { ExamDetail, ExamSummary, NoticeSubjectDto } from "@aprovaai/shared";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { CurrentUser } from "../../plugins/auth-context";

export interface CatalogFilter {
  search?: string | undefined;
  uf?: string | undefined;
  board?: string | undefined;
  situation?: ExamSummary["situation"] | undefined;
  open?: boolean | undefined;
  includeNational?: boolean | undefined;
  sphere?: ExamSummary["sphere"] | undefined;
  educationLevel?: "fundamental" | "medio" | "superior" | undefined;
  page: number;
  pageSize: number;
}

const isEditor = (user: CurrentUser) => user.role === "editor" || user.role === "admin";

/**
 * Quem enxerga o quê: catálogo validado para todos; rascunhos do catálogo só para editor/admin;
 * concurso privado só para o dono.
 */
export function examVisibility(user: CurrentUser): SQL {
  const catalog = isEditor(user)
    ? isNull(exams.ownerUserId)
    : and(isNull(exams.ownerUserId), eq(exams.contentStatus, "validado"));
  return or(catalog, eq(exams.ownerUserId, user.id)) as SQL;
}

const summaryColumns = {
  id: exams.id,
  title: exams.title,
  organization: organizations.name,
  board: boards.name,
  sphere: exams.sphere,
  uf: exams.uf,
  situation: exams.situation,
  situationConfirmed: exams.situationConfirmed,
  examDate: exams.examDate,
  datesConfirmed: exams.datesConfirmed,
  isSample: exams.isSample,
  ownerUserId: exams.ownerUserId,
  contentStatus: exams.contentStatus,
  registrationEnd: exams.registrationEnd,
  // Agregados por concurso (subconsultas): vagas, maior salário e se já há conteúdo programático.
  vacancies: sql<
    number | null
  >`(select sum(${examPositions.vacancies})::int from ${examPositions} where ${examPositions.examId} = ${exams.id})`,
  salaryMax: sql<
    number | null
  >`(select max(${examPositions.salary})::float from ${examPositions} where ${examPositions.examId} = ${exams.id})`,
  positionCount: sql<number>`(select count(*)::int from ${examPositions} where ${examPositions.examId} = ${exams.id})`,
  hasNotice: sql<boolean>`exists (select 1 from ${examNotices} where ${examNotices.examId} = ${exams.id})`,
};

type SummaryRow = Omit<ExamSummary, "isPrivate"> & { ownerUserId: string | null };
const toSummary = ({ ownerUserId, ...row }: SummaryRow): ExamSummary => ({
  ...row,
  isPrivate: ownerUserId !== null,
});

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class CatalogRepository {
  constructor(private readonly db: Database) {}

  async list(user: CurrentUser, filter: CatalogFilter): Promise<{ items: ExamSummary[]; total: number }> {
    const conditions: SQL[] = [examVisibility(user)];
    if (filter.search) {
      const pattern = likePattern(filter.search);
      conditions.push(or(ilike(exams.title, pattern), ilike(organizations.name, pattern)) as SQL);
    }
    if (filter.uf) {
      conditions.push(
        filter.includeNational
          ? (or(eq(exams.uf, filter.uf), isNull(exams.uf)) as SQL)
          : eq(exams.uf, filter.uf),
      );
    }
    if (filter.board) conditions.push(eq(boards.slug, filter.board));
    if (filter.situation) conditions.push(eq(exams.situation, filter.situation));
    if (filter.open) conditions.push(ne(exams.situation, "encerrado"));
    if (filter.sphere) conditions.push(eq(exams.sphere, filter.sphere));
    if (filter.educationLevel) conditions.push(eq(exams.educationLevel, filter.educationLevel));
    const where = and(...conditions);

    const base = this.db
      .select(summaryColumns)
      .from(exams)
      .innerJoin(organizations, eq(organizations.id, exams.organizationId))
      .leftJoin(boards, eq(boards.id, exams.boardId));
    const [rows, [total]] = await Promise.all([
      base
        .where(where)
        .orderBy(desc(exams.createdAt), exams.id)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db
        .select({ value: count() })
        .from(exams)
        .innerJoin(organizations, eq(organizations.id, exams.organizationId))
        .leftJoin(boards, eq(boards.id, exams.boardId))
        .where(where),
    ]);
    return { items: rows.map(toSummary), total: total?.value ?? 0 };
  }

  async listBoards(): Promise<{ slug: string; name: string }[]> {
    return this.db.select({ slug: boards.slug, name: boards.name }).from(boards).orderBy(asc(boards.name));
  }

  /** Detalhe com o edital vigente verticalizado. null se não existir ou não for visível. */
  async detail(user: CurrentUser, examId: string): Promise<ExamDetail | null> {
    const [row] = await this.db
      .select({
        ...summaryColumns,
        city: exams.city,
        officialUrl: exams.officialUrl,
        lastVerifiedAt: exams.lastVerifiedAt,
      })
      .from(exams)
      .innerJoin(organizations, eq(organizations.id, exams.organizationId))
      .leftJoin(boards, eq(boards.id, exams.boardId))
      .where(and(eq(exams.id, examId), examVisibility(user)));
    if (!row) return null;

    const positions = await this.db
      .select({
        id: examPositions.id,
        title: examPositions.title,
        vacancies: examPositions.vacancies,
        salary: sql<number | null>`${examPositions.salary}::float`,
      })
      .from(examPositions)
      .where(eq(examPositions.examId, examId))
      .orderBy(asc(examPositions.title));

    const [notice] = await this.db
      .select()
      .from(examNotices)
      .where(and(eq(examNotices.examId, examId), eq(examNotices.isCurrent, true)))
      .orderBy(desc(examNotices.version))
      .limit(1);

    const { city, officialUrl, lastVerifiedAt, ...summary } = row;
    return {
      ...toSummary(summary),
      city,
      officialUrl,
      lastVerifiedAt: lastVerifiedAt?.toISOString() ?? null,
      positions,
      notice: notice
        ? {
            id: notice.id,
            title: notice.title,
            version: notice.version,
            publishedAt: notice.publishedAt,
            officialUrl: notice.officialUrl,
            scoringType: notice.scoringType,
            wrongPenalty: notice.wrongPenalty,
            subjects: await this.noticeSubjects(notice.id),
          }
        : null,
    };
  }

  /** Disciplinas e assuntos de um edital, na ordem do edital. */
  async noticeSubjects(noticeId: string): Promise<NoticeSubjectDto[]> {
    const subjectRows = await this.db
      .select({
        id: noticeSubjects.id,
        subjectId: noticeSubjects.subjectId,
        name: subjects.name,
        weight: noticeSubjects.weight,
        questionCount: noticeSubjects.questionCount,
        kind: noticeSubjects.kind,
        positionId: noticeSubjects.positionId,
      })
      .from(noticeSubjects)
      .innerJoin(subjects, eq(subjects.id, noticeSubjects.subjectId))
      .where(eq(noticeSubjects.noticeId, noticeId))
      .orderBy(asc(noticeSubjects.sortOrder));
    if (subjectRows.length === 0) return [];

    const topicRows = await this.db
      .select({
        id: noticeTopics.id,
        noticeSubjectId: noticeTopics.noticeSubjectId,
        topicId: noticeTopics.topicId,
        name: topics.name,
        relevance: noticeTopics.relevance,
        rawText: noticeTopics.rawText,
        parentTopicId: topics.parentTopicId,
      })
      .from(noticeTopics)
      .innerJoin(topics, eq(topics.id, noticeTopics.topicId))
      .where(
        inArray(
          noticeTopics.noticeSubjectId,
          subjectRows.map((s) => s.id),
        ),
      )
      .orderBy(asc(noticeTopics.sortOrder));

    return subjectRows.map((s) => ({
      ...s,
      topics: topicRows.filter((t) => t.noticeSubjectId === s.id).map(({ noticeSubjectId: _ns, ...t }) => t),
    }));
  }

  /** Concurso do catálogo (não privado), para edição pelo editor. */
  async findCatalogExam(examId: string) {
    const [row] = await this.db
      .select()
      .from(exams)
      .where(and(eq(exams.id, examId), isNull(exams.ownerUserId)));
    return row ?? null;
  }

  async hasNotice(examId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: examNotices.id })
      .from(examNotices)
      .where(eq(examNotices.examId, examId))
      .limit(1);
    return Boolean(row);
  }

  async updateExam(examId: string, changes: Partial<typeof exams.$inferInsert>): Promise<void> {
    await this.db.update(exams).set(changes).where(eq(exams.id, examId));
  }

  /** Edital de um concurso visível ao usuário (usado no onboarding). */
  async findVisibleNotice(user: CurrentUser, examId: string, noticeId: string) {
    const [row] = await this.db
      .select({
        noticeId: examNotices.id,
        examId: exams.id,
        examDate: exams.examDate,
        datesConfirmed: exams.datesConfirmed,
      })
      .from(examNotices)
      .innerJoin(exams, eq(exams.id, examNotices.examId))
      .where(and(eq(examNotices.id, noticeId), eq(exams.id, examId), examVisibility(user)));
    return row ?? null;
  }
}
