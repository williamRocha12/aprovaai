// Recursos de IA com um provedor de teste (dublê): valida gate, cota, registro de uso, validação
// da proposta e permissões. O provedor real (Anthropic) não é chamado nos testes.
import { aiExplanations, aiInteractions, featureFlags, seedSampleData } from "@aprovaai/db";
import type { ImportTopic } from "@aprovaai/shared";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiNotice, AiProvider, AiResult, QuestionForAi, TaxonomyOption } from "../src/lib/ai/provider";
import { toImportInput } from "../src/modules/ai/service";
import {
  createTestContext,
  createVerifiedUser,
  resetDatabase,
  type TestClient,
  type TestContext,
} from "./helpers";

const usage = { model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 200 };

const NOTICE: AiNotice = {
  examTitle: "Prefeitura de Teste — Agente Administrativo",
  organizationName: "Prefeitura de Teste",
  organizationAcronym: null,
  sphere: "municipal",
  uf: "sc",
  city: "Teste",
  boardName: "Banca Teste",
  positionTitle: "Agente Administrativo",
  educationLevel: "medio",
  noticeTitle: "Edital 1/2026",
  scoringType: "standard",
  examDate: "data inválida",
  subjects: [
    {
      name: "Língua Portuguesa",
      weight: 1,
      questionCount: 10,
      kind: "basica",
      topics: [
        {
          name: "Crase",
          relevance: 9,
          rawText: "Emprego do sinal indicativo de crase.",
          subtopics: ["Casos facultativos"],
        },
      ],
    },
  ],
  warnings: ["O edital não informa pesos."],
};

class FakeAi implements AiProvider {
  readonly name = "fake";
  calls = 0;
  lastClassifyInput: { question: QuestionForAi; taxonomy: TaxonomyOption[] } | null = null;
  nextExplain: AiResult<{ explanation: string; hasEvidence: boolean }> = {
    ok: true,
    data: { explanation: "Explicação de teste.", hasEvidence: true },
    usage,
  };

  async extractNotice(): Promise<AiResult<AiNotice>> {
    this.calls++;
    return { ok: true, data: NOTICE, usage };
  }
  async classifyQuestion(question: QuestionForAi, taxonomy: TaxonomyOption[]) {
    this.calls++;
    this.lastClassifyInput = { question, taxonomy };
    return {
      ok: true as const,
      data: { topicId: taxonomy[0]?.topicId ?? null, confidence: "alta" as const, reason: "Teste" },
      usage,
    };
  }
  async explainQuestion() {
    this.calls++;
    return this.nextExplain;
  }
}

let ctx: TestContext;
const fake = new FakeAi();
const LONG_TEXT = "Conteúdo programático. ".repeat(20);

beforeAll(async () => {
  ctx = await createTestContext({ AI_DAILY_QUOTA: "3" }, { ai: fake });
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedSampleData(ctx.db);
  await ctx.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, "ai"));
  fake.calls = 0;
});

async function onboard(client: TestClient) {
  const examId = (await client.get("/api/catalog/exams")).json().items[0].id;
  const exam = (await client.get(`/api/catalog/exams/${examId}`)).json();
  await client.request("PUT", "/api/goal", {
    examId,
    noticeId: exam.notice.id,
    weeklyAvailability: { "0": 60, "1": 60, "2": 60, "3": 60, "4": 60, "5": 60, "6": 60 },
    blockMinutes: 60,
    subjects: exam.notice.subjects.map((s: { id: string }) => ({
      noticeSubjectId: s.id,
      active: true,
      selfAssessment: 50,
    })),
  });
}

describe("conversão da proposta de edital", () => {
  it("normaliza UF e relevância, descarta data inválida e nunca marca datas como confirmadas", () => {
    const input = toImportInput(NOTICE);
    expect(input.exam.uf).toBe("SC");
    expect(input.exam.examDate).toBeUndefined();
    expect(input.exam.datesConfirmed).toBe(false);
    expect(input.exam.board?.slug).toBe("banca-teste");
    const topic = input.subjects[0]?.topics[0] as ImportTopic | undefined;
    expect(topic?.relevance).toBe(5);
    expect(topic?.subtopics?.[0]?.name).toBe("Casos facultativos");
  });
});

describe("IA", () => {
  it("desligada pela flag: o recurso não existe e não chama o provedor", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    await ctx.db.update(featureFlags).set({ enabled: false }).where(eq(featureFlags.key, "ai"));
    expect((await client.post("/api/ai/notice-extract", { text: LONG_TEXT })).statusCode).toBe(404);
    expect(fake.calls).toBe(0);
  });

  it("extrai edital como PROPOSTA (nada é salvo) e registra o uso sem conteúdo", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "a@exemplo.com");
    const res = await client.post("/api/ai/notice-extract", { text: LONG_TEXT });
    expect(res.statusCode).toBe(200);
    expect(res.json().proposal.exam.title).toBe(NOTICE.examTitle);
    expect(res.json().issues).toEqual([]);
    expect(res.json().warnings).toEqual(["O edital não informa pesos."]);
    expect((await client.get("/api/catalog/exams?search=Prefeitura de Teste")).json().total).toBe(0);

    const [log] = await ctx.db.select().from(aiInteractions).where(eq(aiInteractions.userId, userId));
    expect(log).toMatchObject({
      feature: "notice_extract",
      status: "ok",
      inputTokens: 1000,
      outputTokens: 200,
    });
    expect(log?.costUsd).toBeCloseTo(0.008);
  });

  it("cota diária por usuário", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    for (let i = 0; i < 3; i++)
      expect((await client.post("/api/ai/notice-extract", { text: LONG_TEXT })).statusCode).toBe(200);
    const blocked = await client.post("/api/ai/notice-extract", { text: LONG_TEXT });
    expect(blocked.statusCode).toBe(429);
    expect(fake.calls).toBe(3);
  });

  it("recusa texto curto demais", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    expect((await client.post("/api/ai/notice-extract", { text: "curto" })).statusCode).toBe(400);
  });

  it("classifica só questões próprias, com os assuntos do edital do plano, e o dono aplica", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const catalogId = (await client.get("/api/questions")).json().items[0].id;
    expect((await client.post(`/api/ai/questions/${catalogId}/classify`)).statusCode).toBe(403);

    const own = await client.post("/api/questions", {
      type: "certo_errado",
      statement: "A crase é obrigatória antes de palavra feminina regida por preposição a.",
      correctAnswer: "C",
    });
    expect((await client.post(`/api/ai/questions/${own.json().id}/classify`)).statusCode).toBe(400);

    await onboard(client);
    const suggestion = (await client.post(`/api/ai/questions/${own.json().id}/classify`)).json();
    expect(suggestion.generatedByAi).toBe(true);
    expect(suggestion.topicId).toBeTruthy();
    // Nenhum dado pessoal vai ao provedor: só a questão e os nomes dos assuntos.
    expect(JSON.stringify(fake.lastClassifyInput)).not.toContain("a@exemplo.com");

    const applied = await client.patch(`/api/questions/${own.json().id}/taxonomy`, {
      subjectId: suggestion.subjectId,
      topicId: suggestion.topicId,
    });
    expect(applied.json().topicName).toBe(suggestion.topicName);
  });

  it("explica só depois de responder; cacheia; sem evidência não guarda", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const id = (await client.get("/api/questions")).json().items[0].id;
    expect((await client.post(`/api/ai/questions/${id}/explain`)).statusCode).toBe(409);

    await client.post(`/api/questions/${id}/attempts`, { answer: "A", idempotencyKey: randomUUID() });
    fake.nextExplain = {
      ok: true,
      data: { explanation: "Sem base para justificar.", hasEvidence: false },
      usage,
    };
    const uncertain = (await client.post(`/api/ai/questions/${id}/explain`)).json();
    expect(uncertain.hasEvidence).toBe(false);
    expect(await ctx.db.select().from(aiExplanations)).toHaveLength(0);

    fake.nextExplain = { ok: true, data: { explanation: "Explicação de teste.", hasEvidence: true }, usage };
    const first = (await client.post(`/api/ai/questions/${id}/explain`)).json();
    expect(first).toMatchObject({ cached: false, generatedByAi: true });
    const callsAfterFirst = fake.calls;
    const second = (await client.post(`/api/ai/questions/${id}/explain`)).json();
    expect(second.cached).toBe(true);
    expect(fake.calls).toBe(callsAfterFirst);
  });

  it("falha do provedor vira erro claro e fica registrada", async () => {
    const { client, userId } = await createVerifiedUser(ctx, "a@exemplo.com");
    const id = (await client.get("/api/questions")).json().items[0].id;
    await client.post(`/api/questions/${id}/attempts`, { answer: "A", idempotencyKey: randomUUID() });
    fake.nextExplain = {
      ok: false,
      reason: "provider_error",
      message: "Não foi possível falar com o provedor de IA.",
      usage: null,
    };
    const res = await client.post(`/api/ai/questions/${id}/explain`);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("AI_ERROR");
    const [log] = await ctx.db.select().from(aiInteractions).where(eq(aiInteractions.userId, userId));
    expect(log?.status).toBe("error");
    fake.nextExplain = { ok: true, data: { explanation: "ok", hasEvidence: true }, usage };
  });
});
