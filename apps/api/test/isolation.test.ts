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
      return { taskId: task.id, cycleId: cycle.id };
    },
    attack: async (b, { taskId, cycleId }) => {
      expect((await b.patch(`/api/tasks/${taskId}`, { status: "concluida" })).statusCode).toBe(404);
      expect((await b.patch(`/api/tasks/${taskId}`, { suggestedDate: "2030-01-01" })).statusCode).toBe(404);
      expect((await b.get("/api/goal")).statusCode).toBe(404);
      const current = (await b.get("/api/plan/current")).json();
      expect(current.cycle?.id).not.toBe(cycleId);
    },
    verify: async (a, { taskId, cycleId }) => {
      const current = (await a.get("/api/plan/current")).json();
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

async function onboardSample(client: TestClient): Promise<{ id: string; tasks: { id: string }[] }> {
  await seedSampleData(ctx.db);
  const list = (await client.get("/api/catalog/exams")).json();
  const examId = list.items.find((e: { isSample: boolean }) => e.isSample).id;
  const exam = (await client.get(`/api/catalog/exams/${examId}`)).json();
  const week = { "0": 120, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 120 };
  const res = await client.request("PUT", "/api/goal", {
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
  return res.json().cycle;
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
