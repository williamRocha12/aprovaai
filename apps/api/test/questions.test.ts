import { addDays, todayIn } from "@aprovaai/core";
import { questionAttempts, reviewItems, seedSampleData } from "@aprovaai/db";
import type { QuestionDetail, QuestionSummary } from "@aprovaai/shared";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const today = () => todayIn("America/Sao_Paulo");

async function listQuestions(client: TestClient, query = ""): Promise<QuestionSummary[]> {
  return (await client.get(`/api/questions?pageSize=50${query}`)).json().items;
}

async function detail(client: TestClient, id: string): Promise<QuestionDetail> {
  return (await client.get(`/api/questions/${id}`)).json();
}

/**
 * Garante uma tentativa ERRADA: o gabarito só aparece depois de responder, então tenta a primeira
 * alternativa e, se ela estiver certa, responde de novo com outra (que necessariamente está errada).
 */
async function answerWrong(client: TestClient, q: QuestionDetail) {
  const send = async (answer: string) =>
    (await client.post(`/api/questions/${q.id}/attempts`, { answer, idempotencyKey: randomUUID() })).json();
  const first = await send(q.options[0]?.label ?? "A");
  if (!first.attempt.isCorrect) return first;
  const other = q.options.find((o) => o.label !== first.correctAnswer)?.label ?? "E";
  return send(other);
}

describe("banco de questões e resolução", () => {
  it("lista as questões de exemplo e esconde o gabarito antes de responder", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const items = await listQuestions(client);
    expect(items).toHaveLength(12);
    expect(items.every((q) => q.isSample)).toBe(true);

    const q = await detail(client, items[0]?.id ?? "");
    expect(q.revealed).toBe(false);
    expect(q.correctAnswer).toBeNull();
    expect(q.explanation).toBeNull();
    expect(q.options.length).toBeGreaterThanOrEqual(2);
  });

  it("errar coloca a questão na revisão de 1 dia; classificar o erro; acertar avança para 7 dias", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const [item] = await listQuestions(client, "&status=nao_respondidas");
    const q = await detail(client, item?.id ?? "");

    const result = await answerWrong(client, q);
    expect(result.attempt.isCorrect).toBe(false);
    expect(result.correctAnswer).toMatch(/^[A-E]$/);
    expect(result.review).toEqual({ stage: 0, dueDate: addDays(today(), 1), status: "ativa" });

    const classified = await client.patch(`/api/attempts/${result.attempt.id}`, {
      errorType: "pegadinha_da_banca",
    });
    expect(classified.json().errorType).toBe("pegadinha_da_banca");

    const right = (
      await client.post(`/api/questions/${q.id}/attempts`, {
        answer: result.correctAnswer,
        context: "revisao",
        idempotencyKey: randomUUID(),
      })
    ).json();
    expect(right.attempt.isCorrect).toBe(true);
    expect(right.review).toEqual({ stage: 1, dueDate: addDays(today(), 7), status: "ativa" });

    const after = await detail(client, q.id);
    expect(after.revealed).toBe(true);
    expect(after.history.map((h) => h.isCorrect)).toContain(false);
    expect(after.history.length).toBeGreaterThanOrEqual(2);
  });

  it("tentativa é idempotente pela chave (reenvio não duplica)", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "a@exemplo.com");
    const [item] = await listQuestions(client);
    const key = randomUUID();
    const a = (
      await client.post(`/api/questions/${item?.id}/attempts`, { answer: "C", idempotencyKey: key })
    ).json();
    const b = (
      await client.post(`/api/questions/${item?.id}/attempts`, { answer: "C", idempotencyKey: key })
    ).json();
    expect(b.attempt.id).toBe(a.attempt.id);
    const rows = await ctx.db.select().from(questionAttempts).where(eq(questionAttempts.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("só tentativa errada recebe classificação de erro", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const [item] = await listQuestions(client);
    const q = await detail(client, item?.id ?? "");
    // Descobre o gabarito errando uma vez e depois acerta.
    const wrong = await answerWrong(client, q);
    const right = (
      await client.post(`/api/questions/${q.id}/attempts`, {
        answer: wrong.correctAnswer,
        idempotencyKey: randomUUID(),
      })
    ).json();
    expect(right.attempt.isCorrect).toBe(true);
    expect((await client.patch(`/api/attempts/${right.attempt.id}`, { errorType: "chute" })).statusCode).toBe(
      409,
    );
  });
});

describe("cadastro de questões do usuário", () => {
  it("cadastro rápido de questão de outra plataforma entra no caderno de erros e na revisão", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const res = await client.post("/api/questions/quick", {
      type: "multipla_escolha",
      board: "Cebraspe",
      year: 2024,
      externalSource: "Outra plataforma",
      reference: "Q123456",
      myAnswer: "B",
      isCorrect: false,
      errorType: "falta_de_teoria",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().review.dueDate).toBe(addDays(today(), 1));

    const notebook = (await client.get("/api/error-notebook")).json();
    expect(notebook.entries).toHaveLength(1);
    expect(notebook.entries[0].lastErrorType).toBe("falta_de_teoria");
    expect(notebook.distribution).toEqual([{ errorType: "falta_de_teoria", count: 1 }]);

    const reviews = (await client.get("/api/reviews")).json();
    expect(reviews.counts.futura).toBe(1);
  });

  it("questão pessoal completa: valida gabarito e alternativas", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const bad = await client.post("/api/questions", {
      type: "multipla_escolha",
      statement: "Qual é a capital de SC?",
      options: [{ label: "A", text: "Florianópolis" }],
      correctAnswer: "B",
    });
    expect(bad.statusCode).toBe(400);

    const ok = await client.post("/api/questions", {
      type: "multipla_escolha",
      statement: "Qual é a capital de SC?",
      options: [
        { label: "A", text: "Florianópolis" },
        { label: "B", text: "Joinville" },
      ],
      correctAnswer: "A",
      explanation: "Florianópolis é a capital.",
    });
    expect(ok.statusCode).toBe(201);
    const mine = await listQuestions(client, "&scope=minhas");
    expect(mine.map((q) => q.id)).toContain(ok.json().id);
  });

  it("anotação, favorito, lista e reporte", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const [item] = await listQuestions(client);
    const id = item?.id ?? "";

    expect(
      (await client.request("PUT", `/api/questions/${id}/note`, { body: "Cai muito!" })).json().note,
    ).toBe("Cai muito!");
    expect((await detail(client, id)).note).toBe("Cai muito!");

    expect((await client.post(`/api/questions/${id}/favorite`)).json().isFavorite).toBe(true);
    expect((await listQuestions(client, "&status=favoritas")).map((q) => q.id)).toEqual([id]);

    const list = (await client.post("/api/lists", { name: "Revisar sábado" })).json();
    expect((await client.post(`/api/lists/${list.id}/items`, { questionId: id })).statusCode).toBe(204);
    expect((await listQuestions(client, `&listId=${list.id}`)).map((q) => q.id)).toEqual([id]);
    const lists = (await client.get("/api/lists")).json();
    expect(lists.map((l: { name: string; count: number }) => [l.name, l.count])).toEqual([
      ["Favoritas", 1],
      ["Revisar sábado", 1],
    ]);

    expect(
      (await client.post(`/api/questions/${id}/reports`, { reason: "O gabarito parece trocado." }))
        .statusCode,
    ).toBe(201);
  });
});

describe("integração com o planejador e dashboard", () => {
  async function onboard(client: TestClient) {
    const list = (await client.get("/api/catalog/exams")).json();
    const examId = list.items[0].id;
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
  }

  it("revisão vencida vira o primeiro bloco do ciclo recalculado", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "a@exemplo.com");
    await onboard(client);
    const [item] = await listQuestions(client);
    const q = await detail(client, item?.id ?? "");
    await answerWrong(client, q);
    await ctx.db
      .update(reviewItems)
      .set({ dueDate: addDays(today(), -2) })
      .where(eq(reviewItems.userId, userId));

    const plan = (await client.post("/api/plan/recalculate")).json();
    const first = plan.cycle.tasks[0];
    expect(first.type).toBe("revisao");
    expect(first.topicName).toBe(q.topicName);
    expect(first.justification).toMatch(/vencida/);
  });

  it("dashboard mostra métricas reais calculadas das tentativas", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    await onboard(client);
    const items = await listQuestions(client);
    for (const item of items.slice(0, 3)) {
      const q = await detail(client, item.id);
      const r = await answerWrong(client, q);
      await client.patch(`/api/attempts/${r.attempt.id}`, { errorType: "falta_de_atencao" });
    }
    const d = (await client.get("/api/dashboard")).json();
    const answered = d.questions.answered;
    expect(d.isSample).toBe(true);
    expect(answered).toBeGreaterThanOrEqual(3);
    expect(d.questions.correct).toBe(answered - 3);
    expect(d.errorDistribution).toEqual([{ errorType: "falta_de_atencao", count: 3 }]);
    expect(d.streakDays).toBe(1);
    expect(d.weekly).toHaveLength(8);
    expect(d.weekly.at(-1).answered).toBe(answered);
    expect(d.coverage.total).toBeGreaterThan(0);
  });
});
