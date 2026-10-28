import { noticeImportSchema } from "@aprovaai/shared";
import { and, count, eq, inArray } from "drizzle-orm";
import { importNotice } from "../catalog-import";
import type { Database } from "../client";
import { exams, userExamGoals } from "../schema";
import { SAMPLE_TRT_FCC } from "./trt-fcc";

/** Cria o concurso de exemplo se ainda não existir (idempotente). */
export async function seedSampleData(db: Database): Promise<"created" | "exists"> {
  const parsed = noticeImportSchema.parse(SAMPLE_TRT_FCC);
  const [existing] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(and(eq(exams.title, parsed.exam.title), eq(exams.isSample, true)));
  if (existing) return "exists";
  await importNotice(db, parsed, {
    ownerUserId: null,
    contentStatus: "validado",
    contentOrigin: "autoral",
    isSample: true,
  });
  return "created";
}

/**
 * Remove os concursos de exemplo. Se algum usuário tiver plano em cima deles, só remove com `force`
 * (o plano desses usuários é apagado junto).
 */
export async function removeSampleData(
  db: Database,
  force = false,
): Promise<{ exams: number; goals: number }> {
  const sampleIds = (await db.select({ id: exams.id }).from(exams).where(eq(exams.isSample, true))).map(
    (e) => e.id,
  );
  if (sampleIds.length === 0) return { exams: 0, goals: 0 };

  const [goalCount] = await db
    .select({ value: count() })
    .from(userExamGoals)
    .where(inArray(userExamGoals.examId, sampleIds));
  const goals = goalCount?.value ?? 0;
  if (goals > 0 && !force) {
    throw new Error(
      `${goals} plano(s) de usuário usam o concurso de exemplo. Rode com --force para apagá-los junto.`,
    );
  }
  await db.transaction(async (tx) => {
    await tx.delete(userExamGoals).where(inArray(userExamGoals.examId, sampleIds));
    await tx.delete(exams).where(inArray(exams.id, sampleIds));
  });
  return { exams: sampleIds.length, goals };
}
