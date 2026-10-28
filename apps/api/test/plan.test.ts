import { seedSampleData, studyTasks } from "@aprovaai/db";
import type { Cycle, ExamDetail, GoalInput, Task } from "@aprovaai/shared";
import { addDays, todayIn } from "@aprovaai/core";
import { eq } from "drizzle-orm";
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

const WEEK = { "0": 120, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 120 };
const today = () => todayIn("America/Sao_Paulo");

async function sampleExam(client: TestClient): Promise<ExamDetail> {
  const list = (await client.get("/api/catalog/exams")).json();
  const id = list.items.find((e: { isSample: boolean }) => e.isSample).id;
  return (await client.get(`/api/catalog/exams/${id}`)).json();
}

function goalInput(exam: ExamDetail, overrides: Partial<GoalInput> = {}): GoalInput {
  const notice = exam.notice;
  if (!notice) throw new Error("Exemplo sem edital.");
  return {
    examId: exam.id,
    noticeId: notice.id,
    positionId: exam.positions[0]?.id ?? null,
    targetExamDate: null,
    weeklyAvailability: WEEK,
    blockMinutes: 60,
    subjects: notice.subjects.map((s, i) => ({
      noticeSubjectId: s.id,
      active: true,
      selfAssessment: 30 + i * 5,
    })),
    ...overrides,
  };
}

async function onboard(client: TestClient, overrides: Partial<GoalInput> = {}) {
  const exam = await sampleExam(client);
  const res = await client.post("/api/goals", goalInput(exam, overrides));
  const state = res.json() as { goalId: string; cycle: Cycle | null; issues: { code: string }[] };
  return { exam, res, state, goalId: state.goalId };
}

describe("catálogo", () => {
  it("lista o concurso de exemplo marcado e mostra o edital verticalizado", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const exam = await sampleExam(client);
    expect(exam.isSample).toBe(true);
    expect(exam.datesConfirmed).toBe(false);
    expect(exam.notice?.subjects.length).toBe(9);
    expect(exam.notice?.subjects[0]?.topics.length).toBeGreaterThan(0);
  });

  it("filtra por banca e situação", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    expect((await client.get("/api/catalog/exams?board=fcc")).json().total).toBe(1);
    expect((await client.get("/api/catalog/exams?board=cebraspe")).json().total).toBe(0);
    expect((await client.get("/api/catalog/exams?situation=encerrado")).json().total).toBe(0);
  });

  it("filtra em aberto por estado, incluindo concursos nacionais só quando pedido", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    // O exemplo é federal (sem UF) e está "previsto" (em aberto).
    expect((await client.get("/api/catalog/exams?open=true")).json().total).toBe(1);
    expect((await client.get("/api/catalog/exams?open=true&uf=SC")).json().total).toBe(0);
    expect((await client.get("/api/catalog/exams?open=true&uf=SC&includeNational=true")).json().total).toBe(
      1,
    );
  });

  it("usuário importa concurso próprio (privado); editor publica no catálogo", async () => {
    const { client: user } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { client: editor } = await createVerifiedUser(ctx, "editor@exemplo.com", "editor");
    const data = {
      exam: {
        title: "Prefeitura de Teste",
        organization: { name: "Prefeitura de Teste", sphere: "municipal", uf: "SC" },
        sphere: "municipal",
        uf: "SC",
      },
      notice: { title: "Edital 1/2026" },
      subjects: [{ name: "Língua Portuguesa", weight: 1, topics: [{ name: "Crase", relevance: 4 }] }],
    };

    const own = await user.post("/api/catalog/import", { data, target: "catalog" });
    expect(own.statusCode).toBe(201);
    expect(own.json().target).toBe("private");
    const detail = (await user.get(`/api/catalog/exams/${own.json().examId}`)).json();
    expect(detail.isPrivate).toBe(true);

    const draft = await editor.post("/api/catalog/import", { data, target: "catalog", publish: false });
    expect(draft.json().target).toBe("catalog");
    expect((await user.get(`/api/catalog/exams/${draft.json().examId}`)).statusCode).toBe(404);

    const publish = await editor.patch(`/api/catalog/exams/${draft.json().examId}`, {
      contentStatus: "validado",
    });
    expect(publish.statusCode).toBe(200);
    expect((await user.get(`/api/catalog/exams/${draft.json().examId}`)).statusCode).toBe(200);
    expect(
      (await user.patch(`/api/catalog/exams/${draft.json().examId}`, { situation: "encerrado" })).statusCode,
    ).toBe(403);
  });
});

describe("onboarding e ciclo", () => {
  it("gera o primeiro ciclo persistido, com justificativa e sem estourar a disponibilidade", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { res, state, goalId } = await onboard(client);
    expect(res.statusCode).toBe(201);
    expect(state.issues).toEqual([]);
    const cycle = state.cycle as Cycle;
    expect(cycle.phase).toBe("base");
    expect(cycle.tasks.length).toBeGreaterThan(0);

    const perDay = new Map<string, number>();
    for (const t of cycle.tasks) {
      expect(t.durationMin).toBeGreaterThan(0);
      expect(t.justification.length).toBeGreaterThan(10);
      perDay.set(t.suggestedDate, (perDay.get(t.suggestedDate) ?? 0) + t.durationMin);
    }
    for (const minutes of perDay.values()) expect(minutes).toBeLessThanOrEqual(120);

    // Todas as 9 disciplinas ativas têm ao menos um bloco (14h na semana comportam).
    expect(new Set(cycle.tasks.map((t) => t.subjectName)).size).toBe(9);

    const again = (await client.get(`/api/goals/${goalId}/plan`)).json();
    expect(again.cycle.id).toBe(cycle.id);
  });

  it("concluir, pular e recalcular nunca apaga o histórico", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { state, goalId } = await onboard(client);
    const [first, second] = (state.cycle as Cycle).tasks;
    if (!first || !second) throw new Error("Ciclo sem tarefas suficientes.");

    expect((await client.patch(`/api/tasks/${first.id}`, { status: "concluida" })).json().status).toBe(
      "concluida",
    );
    expect((await client.patch(`/api/tasks/${second.id}`, { status: "pulada" })).json().status).toBe(
      "pulada",
    );

    const recalculated = (await client.post(`/api/goals/${goalId}/plan/recalculate`)).json();
    expect(recalculated.cycle.number).toBe(2);

    const [done] = await ctx.db.select().from(studyTasks).where(eq(studyTasks.id, first.id));
    const [skipped] = await ctx.db.select().from(studyTasks).where(eq(studyTasks.id, second.id));
    expect(done?.status).toBe("concluida");
    expect(skipped?.status).toBe("pulada");

    const cancelled = await ctx.db.select().from(studyTasks).where(eq(studyTasks.status, "cancelada"));
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every((t) => t.supersededByCycleId === recalculated.cycle.id)).toBe(true);

    // O tempo da tarefa concluída hoje é descontado do dia no novo ciclo.
    const todayMinutes = recalculated.cycle.tasks
      .filter((t: { suggestedDate: string }) => t.suggestedDate === today())
      .reduce((s: number, t: { durationMin: number }) => s + t.durationMin, 0);
    expect(todayMinutes).toBeLessThanOrEqual(120 - first.durationMin);
  });

  it("reagenda arrastando para outro dia, mas não para um dia cheio", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { state, goalId } = await onboard(client);
    const tasks = (state.cycle as Cycle).tasks;
    const task = tasks.find((t) => t.suggestedDate === today()) ?? tasks[0];
    if (!task) throw new Error("sem tarefa");
    const otherDay = addDays(today(), 1);
    expect((await client.patch(`/api/tasks/${task.id}`, { suggestedDate: otherDay })).statusCode).toBe(409);

    // Pular uma tarefa de amanhã libera espaço; outra tarefa da mesma duração pode ir para lá.
    const tomorrowTask = tasks.find((t) => t.suggestedDate === otherDay);
    const mover = tasks.find(
      (t) => t.suggestedDate !== otherDay && t.durationMin === tomorrowTask?.durationMin,
    );
    if (!tomorrowTask || !mover) throw new Error("cenário sem tarefas comparáveis");
    await client.patch(`/api/tasks/${tomorrowTask.id}`, { status: "pulada" });
    const moved = await client.patch(`/api/tasks/${mover.id}`, { suggestedDate: otherDay });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().suggestedDate).toBe(otherDay);

    const past = await client.patch(`/api/tasks/${mover.id}`, { suggestedDate: addDays(today(), -1) });
    expect(past.statusCode).toBe(400);
  });

  it("sessão de estudo pelo cronômetro conclui a tarefa e marca o assunto como estudado", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { state, goalId } = await onboard(client);
    const task = (state.cycle as Cycle).tasks[0];
    const now = new Date();
    const res = await client.post("/api/sessions", {
      taskId: task?.id,
      startedAt: new Date(now.getTime() - 50 * 60_000).toISOString(),
      endedAt: now.toISOString(),
      netMinutes: 45,
      source: "cronometro",
      completeTask: true,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().topicName).toBe(task?.topicName);
    const current = (await client.get(`/api/goals/${goalId}/plan`)).json();
    expect(current.cycle.tasks.find((t: { id: string }) => t.id === task?.id).status).toBe("concluida");
    expect((await client.get("/api/sessions")).json()).toHaveLength(1);
  });

  it("casos de borda viram mensagens claras", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const zero = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    const first = await onboard(client, { weeklyAvailability: zero });
    expect(first.state.issues[0]?.code).toBe("NO_AVAILABILITY");
    const past = goalInput(first.exam, { targetExamDate: addDays(today(), -3) });
    const updated = (await client.request("PUT", `/api/goals/${first.goalId}`, past)).json();
    expect(updated.issues[0]?.code).toBe("EXAM_IN_PAST");

    const none = goalInput(first.exam);
    none.subjects = none.subjects.map((s) => ({ ...s, active: false }));
    expect((await client.request("PUT", `/api/goals/${first.goalId}`, none)).statusCode).toBe(400);
  });

  it("prova perto entra na reta final com simulado", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { state } = await onboard(client, { targetExamDate: addDays(today(), 20) });
    expect(state.cycle?.phase).toBe("reta_final");
    expect(state.cycle?.daysToExam).toBe(20);
    expect(state.cycle?.tasks.filter((t) => t.type === "simulado")).toHaveLength(1);
  });
});

describe("vários concursos", () => {
  /** Cria um concurso privado com edital próprio (para ter um segundo edital no teste). */
  async function privateExam(client: TestClient, title: string): Promise<ExamDetail> {
    const res = await client.post("/api/catalog/import", {
      target: "private",
      data: {
        exam: {
          title,
          organization: { name: `Órgão ${title}`, sphere: "estadual", uf: "SC" },
          sphere: "estadual",
          uf: "SC",
          situation: "edital_publicado",
        },
        notice: { title: `Edital ${title}` },
        subjects: [{ name: `Matéria ${title}`, topics: [{ name: "Assunto 1" }, { name: "Assunto 2" }] }],
      },
    });
    expect(res.statusCode).toBe(201);
    return (await client.get(`/api/catalog/exams/${res.json().examId}`)).json();
  }

  it("estuda dois concursos com ciclos separados e lista os dois em Meus concursos", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const trt = await onboard(client);
    const other = await privateExam(client, "PC SC");
    const second = await client.post("/api/goals", goalInput(other));
    expect(second.statusCode).toBe(201);
    const secondId = second.json().goalId as string;

    const planA = (await client.get(`/api/goals/${trt.goalId}/plan`)).json();
    const planB = (await client.get(`/api/goals/${secondId}/plan`)).json();
    expect(planA.cycle.id).not.toBe(planB.cycle.id);
    expect(new Set(planB.cycle.tasks.map((t: Task) => t.subjectName))).toEqual(new Set(["Matéria PC SC"]));

    const goals = (await client.get("/api/goals")).json();
    expect(goals).toHaveLength(2);
    expect(goals.every((g: { status: string }) => g.status === "ativo")).toBe(true);
    const card = goals.find((g: { id: string }) => g.id === secondId);
    expect(card.uf).toBe("SC");
    expect(card.week.plannedMinutes).toBeGreaterThan(0);
  });

  it("não deixa estudar o mesmo edital duas vezes nem passar de 3 ativos", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { exam } = await onboard(client);
    expect((await client.post("/api/goals", goalInput(exam))).statusCode).toBe(409);

    for (const title of ["B", "C"]) {
      expect((await client.post("/api/goals", goalInput(await privateExam(client, title)))).statusCode).toBe(
        201,
      );
    }
    const fourth = await privateExam(client, "D");
    expect((await client.post("/api/goals", goalInput(fourth))).statusCode).toBe(409);
  });

  it("pausar fecha o ciclo sem apagar histórico; reativar gera um ciclo novo", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { state, goalId } = await onboard(client);
    const firstCycle = (state.cycle as Cycle).id;

    const paused = await client.patch(`/api/goals/${goalId}/status`, { status: "pausado" });
    expect(paused.json().status).toBe("pausado");
    const pausedPlan = (await client.get(`/api/goals/${goalId}/plan`)).json();
    expect(pausedPlan.cycle).toBeNull();
    expect(pausedPlan.issues[0].code).toBe("GOAL_PAUSED");
    const cancelled = await ctx.db.select().from(studyTasks).where(eq(studyTasks.status, "cancelada"));
    expect(cancelled.length).toBeGreaterThan(0);

    expect((await client.patch(`/api/goals/${goalId}/status`, { status: "ativo" })).statusCode).toBe(200);
    const resumed = (await client.get(`/api/goals/${goalId}/plan`)).json();
    expect(resumed.cycle.id).not.toBe(firstCycle);
  });

  it("edição não troca de edital: para outro edital, adiciona outro concurso", async () => {
    const { client } = await createVerifiedUser(ctx, "a@exemplo.com");
    const { goalId } = await onboard(client);
    const other = await privateExam(client, "Outro");
    const res = await client.request("PUT", `/api/goals/${goalId}`, goalInput(other));
    expect(res.statusCode).toBe(400);
  });
});
