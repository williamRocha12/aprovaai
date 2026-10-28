import { featureFlags, jobs, pastExams, seedSampleData, sessions } from "@aprovaai/db";
import type { PastExamDetail } from "@aprovaai/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runJobs } from "../src/lib/jobs";
import { FakeAi } from "./fake-ai";
import {
  createTestContext,
  createVerifiedUser,
  resetDatabase,
  type TestClient,
  type TestContext,
} from "./helpers";

let ctx: TestContext;
const fake = new FakeAi();
const CRON_SECRET = "segredo-do-cron-com-16+";

beforeAll(async () => {
  ctx = await createTestContext({ CRON_SECRET }, { ai: fake });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedSampleData(ctx.db);
  await ctx.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, "ai"));
});

/** Prova autoral no formato de texto extraído de PDF (4 questões, a 4ª anulada). */
function examText(seed: string) {
  return `PROVA OBJETIVA ${seed}
1. Primeira questão sobre o tema ${seed} com enunciado suficiente.
(A) Alternativa um
(B) Alternativa dois
(C) Alternativa três
2. Segunda questão ${seed}, também de múltipla escolha.
(A) Sim
(B) Não
3. Terceira questão ${seed} sobre outro ponto do edital.
(A) Verdadeiro
(B) Falso
4. Quarta questão ${seed}, anulada pela banca.
(A) Opção
(B) Outra
${"Texto complementar da prova. ".repeat(8)}`;
}

async function referenceNoticeId(client: TestClient): Promise<string> {
  const examId = (await client.get("/api/catalog/exams")).json().items[0].id;
  return (await client.get(`/api/catalog/exams/${examId}`)).json().notice.id;
}

async function importExam(editor: TestClient, seed: string, year: number, noticeId: string | null) {
  return editor.post("/api/past-exams", {
    boardName: "FCC",
    organization: "Tribunal de Teste",
    positionTitle: "Analista",
    year,
    sourceUrl: `https://www.fcc.org.br/provas/${seed}.pdf`,
    referenceNoticeId: noticeId,
    examText: examText(seed),
    answerKeyText: "1 A 2 B 3 A 4 X",
  });
}

describe("provas anteriores", () => {
  it("pipeline: separa questões, aplica gabarito, IA classifica e confiança baixa vai para revisão", async () => {
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const res = await importExam(editor, "p1", 2024, await referenceNoticeId(editor));
    expect(res.statusCode).toBe(201);
    const exam = res.json() as PastExamDetail;
    expect(exam.questionCount).toBe(4);
    expect(exam.status).toBe("em_revisao");
    const [q1, q2, , q4] = exam.items;
    expect(q1).toMatchObject({ correctAnswer: "A", confidence: "alta", needsReview: false });
    expect(q2).toMatchObject({ correctAnswer: "B", confidence: "baixa", needsReview: true });
    expect(q4?.annulled).toBe(true);

    expect((await importExam(editor, "p1", 2024, null)).statusCode).toBe(409);
  });

  it("sem IA: tudo vai para revisão humana; revisar e concluir libera para o Raio-X", async () => {
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    await ctx.db.update(featureFlags).set({ enabled: false }).where(eq(featureFlags.key, "ai"));
    const noticeId = await referenceNoticeId(editor);
    const exam = (await importExam(editor, "p2", 2023, noticeId)).json() as PastExamDetail;
    expect(exam.items.filter((i) => i.needsReview)).toHaveLength(4);
    expect((await editor.post(`/api/past-exams/${exam.id}/finish-review`)).statusCode).toBe(409);

    const topic = exam.taxonomy[0];
    for (const item of exam.items) {
      const r = await editor.patch(`/api/past-exams/${exam.id}/items/${item.id}`, {
        subjectId: topic?.subjectId,
        topicId: topic?.topicId,
      });
      expect(r.statusCode).toBe(204);
    }
    const done = (await editor.post(`/api/past-exams/${exam.id}/finish-review`)).json();
    expect(done.status).toBe("processado");

    const xray = (await editor.get("/api/board-xray/fcc")).json();
    expect(xray.sample).toMatchObject({ exams: 1, questions: 3, small: true });
    expect(xray.topics[0]).toMatchObject({ topicId: topic?.topicId, questionCount: 3, share: 1 });
  });

  it("usuário comum não importa nem vê texto integral sem a flag; publicação exige a flag", async () => {
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const { client: user } = await createVerifiedUser(ctx, "user@exemplo.com");
    expect((await importExam(user, "x", 2024, null)).statusCode).toBe(403);

    const exam = (
      await importExam(editor, "p3", 2024, await referenceNoticeId(editor))
    ).json() as PastExamDetail;
    for (const item of exam.items.filter((i) => i.needsReview)) {
      await editor.patch(`/api/past-exams/${exam.id}/items/${item.id}`, {
        subjectId: exam.taxonomy[0]?.subjectId,
        topicId: exam.taxonomy[0]?.topicId,
      });
    }
    await editor.post(`/api/past-exams/${exam.id}/finish-review`);

    const seen = (await user.get(`/api/past-exams/${exam.id}`)).json() as PastExamDetail;
    expect(seen.fullTextVisible).toBe(false);
    expect(seen.items.every((i) => i.statement === null)).toBe(true);
    expect(seen.sourceUrl).toMatch(/^https:\/\/www\.fcc\.org\.br/);

    expect((await editor.post(`/api/past-exams/${exam.id}/publish`)).statusCode).toBe(409);
    await ctx.db
      .update(featureFlags)
      .set({ enabled: true })
      .where(eq(featureFlags.key, "past_exam_full_text"));
    const published = (await editor.post(`/api/past-exams/${exam.id}/publish`)).json();
    expect(published.published).toBe(3); // anulada fica de fora
    const bank = (await user.get("/api/questions?scope=catalogo&pageSize=50")).json();
    expect(bank.items.some((q: { organization: string }) => q.organization.includes("FCC, 2024"))).toBe(true);
  });

  it("incidência da banca (3+ provas) entra na justificativa do planejador", async () => {
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const noticeId = await referenceNoticeId(editor);
    for (const [seed, year] of [
      ["a", 2022],
      ["b", 2023],
      ["c", 2024],
    ] as const) {
      const exam = (await importExam(editor, seed, year, noticeId)).json() as PastExamDetail;
      for (const item of exam.items.filter((i) => i.needsReview)) {
        await editor.patch(`/api/past-exams/${exam.id}/items/${item.id}`, {
          subjectId: exam.taxonomy[0]?.subjectId,
          topicId: exam.taxonomy[0]?.topicId,
        });
      }
    }
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const examId = (await client.get("/api/catalog/exams")).json().items[0].id;
    const detail = (await client.get(`/api/catalog/exams/${examId}`)).json();
    const state = (
      await client.request("PUT", "/api/goal", {
        examId,
        noticeId: detail.notice.id,
        weeklyAvailability: { "0": 120, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 120 },
        blockMinutes: 60,
        subjects: detail.notice.subjects.map((s: { id: string }) => ({
          noticeSubjectId: s.id,
          active: true,
          selfAssessment: 50,
        })),
      })
    ).json();
    const justifications = state.cycle.tasks
      .map((t: { justification: string }) => t.justification)
      .join(" | ");
    expect(justifications).toContain("cai muito na banca");
    expect(justifications).toContain("não apareceu nas provas analisadas da banca");
  });
});

describe("fila de jobs e cron", () => {
  it("cron exige o segredo e roda a manutenção", async () => {
    const { userId } = await createVerifiedUser(ctx, "a@exemplo.com");
    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, userId));

    expect((await ctx.app.inject({ method: "GET", url: "/api/cron/jobs" })).statusCode).toBe(401);
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/cron/jobs",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().succeeded).toBeGreaterThanOrEqual(1);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(0);

    // Mesmo dia: a manutenção não é enfileirada de novo (idempotência por dedupeKey).
    await ctx.app.inject({
      method: "GET",
      url: "/api/cron/jobs",
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect((await ctx.db.select().from(jobs)).filter((j) => j.type === "maintenance_cleanup")).toHaveLength(
      1,
    );
  });

  it("job com falha volta para a fila com backoff e falha de vez após o limite", async () => {
    await ctx.db.insert(jobs).values({ type: "quebra", payload: {}, maxAttempts: 2 });
    const handlers = { quebra: async () => Promise.reject(new Error("falhou de propósito")) };
    const first = await runJobs(ctx.db, handlers, ctx.app.log, { budgetMs: 5_000 });
    expect(first).toMatchObject({ processed: 1, retried: 1 });
    const [retry] = await ctx.db.select().from(jobs);
    expect(retry?.status).toBe("pendente");
    expect(retry?.runAfter.getTime()).toBeGreaterThan(Date.now());

    await ctx.db.update(jobs).set({ runAfter: new Date(Date.now() - 1000) });
    const second = await runJobs(ctx.db, handlers, ctx.app.log, { budgetMs: 5_000 });
    expect(second).toMatchObject({ processed: 1, failed: 1 });
    const [failed] = await ctx.db.select().from(jobs);
    expect(failed).toMatchObject({ status: "falhou", lastError: "falhou de propósito" });
  });

  it("prova com texto sem questões fica com status de erro", async () => {
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const res = await editor.post("/api/past-exams", {
      boardName: "FCC",
      organization: "Órgão",
      positionTitle: "Cargo",
      year: 2024,
      sourceUrl: "https://www.fcc.org.br/x.pdf",
      examText: "Instruções gerais sem questões numeradas. ".repeat(10),
    });
    expect(res.json().status).toBe("erro");
    const [exam] = await ctx.db.select().from(pastExams);
    expect(exam?.errorMessage).toMatch(/Nenhuma questão/);
  });
});
