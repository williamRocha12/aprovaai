import { noticeImportSchema } from "@aprovaai/shared";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { importNotice, slugify } from "../catalog-import";
import type { Database } from "../client";
import { boards, exams, questionOptions, questions, subjects, topics, userExamGoals } from "../schema";
import { SAMPLE_QUESTIONS } from "./questions";
import { SAMPLE_TRT_FCC } from "./trt-fcc";

/** Cria o concurso e as questões de exemplo se ainda não existirem (idempotente). */
export async function seedSampleData(db: Database): Promise<"created" | "exists"> {
  const parsed = noticeImportSchema.parse(SAMPLE_TRT_FCC);
  const [existing] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(and(eq(exams.title, parsed.exam.title), eq(exams.isSample, true)));
  if (!existing) {
    await importNotice(db, parsed, {
      ownerUserId: null,
      contentStatus: "validado",
      contentOrigin: "autoral",
      isSample: true,
    });
  }
  const questionsCreated = await seedSampleQuestions(db);
  return existing && questionsCreated === 0 ? "exists" : "created";
}

async function seedSampleQuestions(db: Database): Promise<number> {
  const [already] = await db.select({ value: count() }).from(questions).where(eq(questions.isSample, true));
  if ((already?.value ?? 0) > 0) return 0;
  const [board] = await db.select({ id: boards.id }).from(boards).where(eq(boards.slug, "fcc"));

  let created = 0;
  await db.transaction(async (tx) => {
    for (const q of SAMPLE_QUESTIONS) {
      const [subject] = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.slug, slugify(q.subject)), isNull(subjects.ownerUserId)));
      if (!subject) continue;
      const [topic] = await tx
        .select({ id: topics.id })
        .from(topics)
        .where(
          and(
            eq(topics.subjectId, subject.id),
            eq(topics.slug, slugify(q.topic)),
            isNull(topics.ownerUserId),
          ),
        );
      const [question] = await tx
        .insert(questions)
        .values({
          type: q.type,
          statement: q.statement,
          boardId: board?.id ?? null,
          organization: "Exemplo (questão autoral)",
          subjectId: subject.id,
          topicId: topic?.id ?? null,
          difficulty: q.difficulty,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          explanationOrigin: "autoral",
          usagePermission: "Conteúdo autoral do AprovaAI",
          contentStatus: "validado",
          contentOrigin: "autoral",
          isSample: true,
        })
        .returning({ id: questions.id });
      if (!question) continue;
      if (q.options?.length) {
        await tx
          .insert(questionOptions)
          .values(
            q.options.map((o, i) => ({
              questionId: question.id,
              label: o.label,
              text: o.text,
              sortOrder: i,
            })),
          );
      }
      created++;
    }
  });
  return created;
}

/**
 * Remove concursos e questões de exemplo. Se algum usuário tiver plano em cima deles, só remove com
 * `force` (o plano desses usuários é apagado junto). Tentativas em questões de exemplo vão junto.
 */
export async function removeSampleData(
  db: Database,
  force = false,
): Promise<{ exams: number; goals: number; questions: number }> {
  const sampleIds = (await db.select({ id: exams.id }).from(exams).where(eq(exams.isSample, true))).map(
    (e) => e.id,
  );
  let goals = 0;
  if (sampleIds.length > 0) {
    const [goalCount] = await db
      .select({ value: count() })
      .from(userExamGoals)
      .where(inArray(userExamGoals.examId, sampleIds));
    goals = goalCount?.value ?? 0;
    if (goals > 0 && !force) {
      throw new Error(
        `${goals} plano(s) de usuário usam o concurso de exemplo. Rode com --force para apagá-los junto.`,
      );
    }
  }
  const removedQuestions = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(questions)
      .where(eq(questions.isSample, true))
      .returning({ id: questions.id });
    if (sampleIds.length > 0) {
      await tx.delete(userExamGoals).where(inArray(userExamGoals.examId, sampleIds));
      await tx.delete(exams).where(inArray(exams.id, sampleIds));
    }
    return deleted.length;
  });
  return { exams: sampleIds.length, goals, questions: removedQuestions };
}
