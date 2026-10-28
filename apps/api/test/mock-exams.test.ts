import { examNotices, featureFlags, seedSampleData } from "@aprovaai/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { distributeQuestions } from "../src/modules/mock-exams/service";
import {
  createTestContext,
  createVerifiedUser,
  resetDatabase,
  type TestClient,
  type TestContext,
} from "./helpers";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedSampleData(ctx.db);
});

async function onboard(client: TestClient) {
  const examId = (await client.get("/api/catalog/exams")).json().items[0].id;
  const exam = (await client.get(`/api/catalog/exams/${examId}`)).json();
  const week = { "0": 120, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 120 };
  await client.request("PUT", "/api/goal", {
    examId,
    noticeId: exam.notice.id,
    weeklyAvailability: week,
    blockMinutes: 60,
    subjects: exam.notice.subjects.map((s: { id: string }) => ({
      noticeSubjectId: s.id,
      active: true,
      selfAssessment: 50,
    })),
  });
  return exam;
}

describe("distributeQuestions", () => {
  it("distribui proporcionalmente ao peso, sem passar do disponível", () => {
    const weights = new Map([
      ["a", 10],
      ["b", 5],
      ["c", 5],
    ]);
    const available = new Map([
      ["a", 100],
      ["b", 100],
      ["c", 1],
    ]);
    const result = distributeQuestions(weights, available, 20);
    expect(result.get("c")).toBe(1);
    expect((result.get("a") ?? 0) + (result.get("b") ?? 0) + 1).toBe(20);
    expect(result.get("a")).toBeGreaterThan(result.get("b") ?? 0);
  });

  it("nunca pede mais do que existe; sem questões = vazio", () => {
    expect([...distributeQuestions(new Map([["a", 1]]), new Map([["a", 3]]), 10).values()]).toEqual([3]);
    expect(distributeQuestions(new Map([["a", 1]]), new Map(), 10).size).toBe(0);
  });
});

describe("simulados", () => {
  it("monta, aplica sem gabarito e corrige pela regra do edital (Cebraspe: errada anula certa)", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const exam = await onboard(client);
    await ctx.db
      .update(examNotices)
      .set({ scoringType: "wrong_cancels_right", wrongPenalty: 1 })
      .where(eq(examNotices.id, exam.notice.id));

    const created = await client.post("/api/mock-exams", { questionCount: 10, timeLimitMin: 30 });
    expect(created.statusCode).toBe(201);
    expect(created.json().questionCount).toBe(10);

    const session = (await client.post(`/api/mock-exams/${created.json().id}/start`)).json();
    expect(session.scoringType).toBe("wrong_cancels_right");
    expect(session.questions).toHaveLength(10);
    expect(JSON.stringify(session)).not.toContain("correctAnswer");

    // Retomar devolve a mesma tentativa em aberto.
    const resumed = (await client.post(`/api/mock-exams/${created.json().id}/start`)).json();
    expect(resumed.attemptId).toBe(session.attemptId);

    // Responde "A" em todas exceto as 2 últimas (em branco).
    const answers = session.questions.map((q: { id: string; options: { label: string }[] }, i: number) => ({
      questionId: q.id,
      answer: i < 8 ? (q.options[0]?.label ?? "A") : null,
      timeSpentSec: 60,
    }));
    const result = (
      await client.post(`/api/mock-exam-attempts/${session.attemptId}/finish`, { answers })
    ).json();
    expect(result.total).toBe(10);
    expect(result.blank).toBe(2);
    expect(result.correct + result.wrong).toBe(8);
    expect(result.score).toBe(Math.max(0, result.correct - result.wrong));
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.bySubject.length).toBeGreaterThan(0);

    // Erradas entram no caderno de erros e na revisão.
    const notebook = (await client.get("/api/error-notebook")).json();
    expect(notebook.entries.length).toBe(result.wrong);

    // Finalizar de novo é idempotente; a sessão não reabre.
    const again = (
      await client.post(`/api/mock-exam-attempts/${session.attemptId}/finish`, { answers: [] })
    ).json();
    expect(again.score).toBe(result.score);
    expect((await client.get(`/api/mock-exam-attempts/${session.attemptId}/session`)).statusCode).toBe(409);
    expect((await client.get("/api/mock-exams")).json()[0].lastAttempt.finished).toBe(true);
  });

  it("recusa questões de fora do simulado e falta de questões", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    await onboard(client);
    const created = (await client.post("/api/mock-exams", { questionCount: 5 })).json();
    const session = (await client.post(`/api/mock-exams/${created.id}/start`)).json();
    const bad = await client.post(`/api/mock-exam-attempts/${session.attemptId}/finish`, {
      answers: [{ questionId: "00000000-0000-4000-8000-000000000000", answer: "A" }],
    });
    expect(bad.statusCode).toBe(400);

    const { client: noPlan } = await createVerifiedUser(ctx, "b@exemplo.com");
    expect((await noPlan.post("/api/mock-exams", { questionCount: 5 })).statusCode).toBe(400);
  });

  it("com a flag desligada, simulados não existem", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    await ctx.db.update(featureFlags).set({ enabled: false }).where(eq(featureFlags.key, "mock_exams"));
    expect((await client.get("/api/mock-exams")).statusCode).toBe(404);
    expect((await client.get("/api/public/config")).json().mockExamsEnabled).toBe(false);
  });
});
