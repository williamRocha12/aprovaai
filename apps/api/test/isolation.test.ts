// Testes de isolamento: o usuário B nunca lê, edita ou apaga dados do usuário A.
// REGRA: todo recurso privado novo entra em `privateResources` abaixo (ver CLAUDE.md).
import { seedSampleData } from "@aprovaai/db";
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
});

interface PrivateResource {
  name: string;
  /** A cria/ajusta o próprio dado; devolve o que B vai tentar atacar. */
  setup: (a: TestClient) => Promise<Record<string, string>>;
  /** B tenta ler/alterar/apagar o dado de A. */
  attack: (b: TestClient, target: Record<string, string>) => Promise<void>;
  /** Confere, pela sessão de A, que nada mudou. */
  verify: (a: TestClient, target: Record<string, string>) => Promise<void>;
}

const privateResources: PrivateResource[] = [
  {
    name: "perfil",
    setup: async (a) => {
      await a.patch("/api/me/profile", { displayName: "Perfil da A", interestAreas: ["tribunais"] });
      return {};
    },
    attack: async (b) => {
      // Não há rota de perfil por id: B só alcança o próprio perfil.
      const res = await b.patch("/api/me/profile", { displayName: "Invasor" });
      expect(res.statusCode).toBe(200);
      expect(res.json().email).toBe("b@exemplo.com");
    },
    verify: async (a) => {
      const me = (await a.get("/api/me")).json();
      expect(me.profile.displayName).toBe("Perfil da A");
      expect(me.profile.interestAreas).toEqual(["tribunais"]);
    },
  },
  {
    name: "sessões",
    setup: async (a) => {
      const list = (await a.get("/api/auth/list-sessions")).json() as Array<{ token: string }>;
      const token = list[0]?.token;
      if (!token) throw new Error("A deveria ter uma sessão.");
      return { token };
    },
    attack: async (b, { token }) => {
      const list = (await b.get("/api/auth/list-sessions")).json() as Array<{ token: string }>;
      expect(list.map((s) => s.token)).not.toContain(token);
      await b.post("/api/auth/revoke-session", { token });
    },
    verify: async (a) => {
      expect((await a.get("/api/me")).statusCode).toBe(200);
    },
  },
  {
    name: "concurso privado",
    setup: async (a) => {
      const res = await a.post("/api/catalog/import", { data: PRIVATE_EXAM, target: "private" });
      return { examId: res.json().examId };
    },
    attack: async (b, { examId }) => {
      expect((await b.get(`/api/catalog/exams/${examId}`)).statusCode).toBe(404);
      const list = (await b.get("/api/catalog/exams")).json();
      expect(list.items.map((e: { id: string }) => e.id)).not.toContain(examId);
    },
    verify: async (a, { examId }) => {
      expect((await a.get(`/api/catalog/exams/${examId}`)).statusCode).toBe(200);
    },
  },
  {
    name: "objetivo, ciclo e tarefas",
    setup: async (a) => {
      const cycle = await onboardSample(a);
      const task = cycle.tasks[0] as { id: string; status: string };
      return { taskId: task.id, cycleId: cycle.id, goalId: cycle.goalId };
    },
    attack: async (b, { taskId, goalId }) => {
      expect((await b.patch(`/api/tasks/${taskId}`, { status: "concluida" })).statusCode).toBe(404);
      expect((await b.patch(`/api/tasks/${taskId}`, { suggestedDate: "2030-01-01" })).statusCode).toBe(404);
      expect((await b.get(`/api/goals/${goalId}`)).statusCode).toBe(404);
      expect((await b.get(`/api/goals/${goalId}/plan`)).statusCode).toBe(404);
      expect((await b.post(`/api/goals/${goalId}/plan/recalculate`)).statusCode).toBe(404);
      expect((await b.patch(`/api/goals/${goalId}/status`, { status: "encerrado" })).statusCode).toBe(404);
      expect((await b.request("PUT", `/api/goals/${goalId}`, {})).statusCode).toBe(400);
      expect((await b.get(`/api/goal/topics?goalId=${goalId}`)).statusCode).toBe(404);
      expect((await b.get(`/api/dashboard?goalId=${goalId}`)).statusCode).toBe(404);
      expect((await b.get("/api/goals")).json()).toEqual([]);
    },
    verify: async (a, { taskId, cycleId, goalId }) => {
      const current = (await a.get(`/api/goals/${goalId}/plan`)).json();
      expect(current.cycle.id).toBe(cycleId);
      expect(current.cycle.tasks.find((t: { id: string }) => t.id === taskId).status).toBe("pendente");
    },
  },
  {
    name: "sessões de estudo",
    setup: async (a) => {
      const cycle = await onboardSample(a);
      const now = new Date();
      const res = await a.post("/api/sessions", {
        taskId: cycle.tasks[0]?.id,
        startedAt: new Date(now.getTime() - 30 * 60_000).toISOString(),
        netMinutes: 30,
      });
      return { sessionId: res.json().id, taskId: cycle.tasks[0]?.id ?? "" };
    },
    attack: async (b, { sessionId, taskId }) => {
      expect((await b.request("DELETE", `/api/sessions/${sessionId}`)).statusCode).toBe(404);
      expect((await b.get("/api/sessions")).json()).toEqual([]);
      const forged = await b.post("/api/sessions", {
        taskId,
        startedAt: new Date().toISOString(),
        netMinutes: 10,
      });
      expect(forged.statusCode).toBe(404);
    },
    verify: async (a) => {
      expect((await a.get("/api/sessions")).json()).toHaveLength(1);
    },
  },
  {
    name: "questão pessoal, tentativa e revisão",
    setup: async (a) => {
      const q = await a.post("/api/questions/quick", {
        type: "certo_errado",
        isCorrect: false,
        myAnswer: "C",
      });
      const created = q.json();
      return { questionId: created.questionId, attemptId: created.attempt.id };
    },
    attack: async (b, { questionId, attemptId }) => {
      expect((await b.get(`/api/questions/${questionId}`)).statusCode).toBe(404);
      expect((await b.patch(`/api/attempts/${attemptId}`, { errorType: "chute" })).statusCode).toBe(404);
      expect((await b.post(`/api/questions/${questionId}/favorite`)).statusCode).toBe(404);
      expect((await b.get("/api/questions?scope=minhas")).json().total).toBe(0);
      expect((await b.get("/api/reviews")).json().items).toEqual([]);
      expect((await b.get("/api/error-notebook")).json().entries).toEqual([]);
    },
    verify: async (a, { questionId }) => {
      const detail = (await a.get(`/api/questions/${questionId}`)).json();
      expect(detail.history[0].errorType).toBeNull();
      expect((await a.get("/api/reviews")).json().items).toHaveLength(1);
    },
  },
  {
    name: "anotações e listas de questões",
    setup: async (a) => {
      await seedSampleData(ctx.db);
      const questionId = (await a.get("/api/questions")).json().items[0].id;
      await a.request("PUT", `/api/questions/${questionId}/note`, { body: "Anotação da A" });
      const list = (await a.post("/api/lists", { name: "Lista da A" })).json();
      await a.post(`/api/lists/${list.id}/items`, { questionId });
      return { questionId, listId: list.id };
    },
    attack: async (b, { questionId, listId }) => {
      expect((await b.get(`/api/questions/${questionId}`)).json().note).toBeNull();
      expect((await b.post(`/api/lists/${listId}/items`, { questionId })).statusCode).toBe(404);
      expect((await b.request("DELETE", `/api/lists/${listId}`)).statusCode).toBe(404);
      expect((await b.get(`/api/questions?listId=${listId}`)).json().total).toBe(0);
      expect((await b.get("/api/lists")).json()).toEqual([]);
    },
    verify: async (a, { questionId, listId }) => {
      expect((await a.get(`/api/questions/${questionId}`)).json().note).toBe("Anotação da A");
      expect((await a.get(`/api/questions?listId=${listId}`)).json().total).toBe(1);
    },
  },
  {
    name: "simulados",
    setup: async (a) => {
      await onboardSample(a);
      const exam = (await a.post("/api/mock-exams", { questionCount: 5 })).json();
      const session = (await a.post(`/api/mock-exams/${exam.id}/start`)).json();
      return { mockExamId: exam.id, attemptId: session.attemptId };
    },
    attack: async (b, { mockExamId, attemptId }) => {
      expect((await b.post(`/api/mock-exams/${mockExamId}/start`)).statusCode).toBe(404);
      expect((await b.get(`/api/mock-exam-attempts/${attemptId}/session`)).statusCode).toBe(404);
      expect((await b.post(`/api/mock-exam-attempts/${attemptId}/finish`, { answers: [] })).statusCode).toBe(
        404,
      );
      expect((await b.get("/api/mock-exams")).json()).toEqual([]);
    },
    verify: async (a, { attemptId }) => {
      expect((await a.get(`/api/mock-exam-attempts/${attemptId}/session`)).statusCode).toBe(200);
    },
  },
  {
    name: "exportação de dados (LGPD)",
    setup: async (a) => {
      await a.patch("/api/me/profile", { displayName: "Segredo da A" });
      return {};
    },
    attack: async (b) => {
      const exported = await b.get("/api/me/export");
      expect(exported.body).not.toContain("Segredo da A");
      expect(exported.body).not.toContain("a@exemplo.com");
    },
    verify: async (a) => {
      expect((await a.get("/api/me/export")).body).toContain("Segredo da A");
    },
  },
];

const PRIVATE_EXAM = {
  exam: {
    title: "Concurso privado da A",
    organization: { name: "Órgão da A", sphere: "municipal", uf: "SC" },
    sphere: "municipal",
  },
  notice: { title: "Edital da A" },
  subjects: [{ name: "Matéria da A", topics: [{ name: "Assunto da A" }] }],
};

async function onboardSample(
  client: TestClient,
): Promise<{ id: string; goalId: string; tasks: { id: string }[] }> {
  await seedSampleData(ctx.db);
  const list = (await client.get("/api/catalog/exams")).json();
  const examId = list.items.find((e: { isSample: boolean }) => e.isSample).id;
  const exam = (await client.get(`/api/catalog/exams/${examId}`)).json();
  const week = { "0": 120, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 120 };
  const res = await client.post("/api/goals", {
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
  const state = res.json();
  return { ...state.cycle, goalId: state.goalId };
}

describe("isolamento entre usuários", () => {
  it.each(privateResources.map((r) => [r.name, r] as const))(
    "%s: B não acessa dados de A",
    async (_name, resource) => {
      const { client: a } = await createVerifiedUser(ctx, "a@exemplo.com");
      const { client: b } = await createVerifiedUser(ctx, "b@exemplo.com");

      const target = await resource.setup(a);
      await resource.attack(b, target);
      await resource.verify(a, target);
    },
  );

  it("/api/me sempre devolve o dono da sessão", async () => {
    const { client: a, userId: aId } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { client: b, userId: bId } = await createVerifiedUser(ctx, "b@exemplo.com");
    expect((await a.get("/api/me")).json().id).toBe(aId);
    expect((await b.get("/api/me")).json().id).toBe(bId);
  });
});
