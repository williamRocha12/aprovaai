import { describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "./dates";
import {
  buildSlots,
  generateCycle,
  phaseFor,
  type PlannerInput,
  type PlannerTopic,
  type PlanResult,
} from "./planner";
import type { WeeklyAvailability } from "./types";

const TODAY = "2026-10-26"; // segunda-feira
const WEEK: WeeklyAvailability = { "0": 0, "1": 120, "2": 120, "3": 120, "4": 120, "5": 120, "6": 240 };

function topic(id: string, subjectId: string, overrides: Partial<PlannerTopic> = {}): PlannerTopic {
  return {
    id,
    subjectId,
    subjectName: `Disciplina ${subjectId}`,
    topicName: `Assunto ${id}`,
    subjectWeight: 1,
    relevance: 3,
    selfAssessment: 50,
    attempts: 0,
    correct: 0,
    lastStudiedAt: null,
    boardIncidence: null,
    covered: false,
    overdueReviews: 0,
    ...overrides,
  };
}

const baseTopics = [
  topic("t1", "port", { subjectName: "Língua Portuguesa", subjectWeight: 2, relevance: 5 }),
  topic("t2", "port", { subjectName: "Língua Portuguesa", subjectWeight: 2, relevance: 2 }),
  topic("t3", "dadm", { subjectName: "Direito Administrativo", subjectWeight: 3, relevance: 4 }),
  topic("t4", "dadm", { subjectName: "Direito Administrativo", subjectWeight: 3, relevance: 5 }),
  topic("t5", "rlm", { subjectName: "Raciocínio Lógico", subjectWeight: 1, relevance: 2 }),
];

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    today: TODAY,
    examDate: null,
    weeklyAvailability: WEEK,
    blockMinutes: 50,
    topics: baseTopics,
    ...overrides,
  };
}

function ok(result: PlanResult) {
  if (!result.ok) throw new Error(`Esperava sucesso: ${JSON.stringify(result.issues)}`);
  return result;
}

function minutesByDate(tasks: { date: string; durationMin: number }[]) {
  const map = new Map<string, number>();
  for (const t of tasks) map.set(t.date, (map.get(t.date) ?? 0) + t.durationMin);
  return map;
}

describe("regras obrigatórias do ciclo", () => {
  it("nunca ultrapassa a disponibilidade de nenhum dia (nem da semana)", () => {
    const plan = ok(generateCycle(input()));
    for (const [date, minutes] of minutesByDate(plan.tasks)) {
      const limit = WEEK[String(weekdayOf(date)) as keyof WeeklyAvailability];
      expect(minutes).toBeLessThanOrEqual(limit);
    }
    const weekly = Object.values(WEEK).reduce((a, b) => a + b, 0);
    expect(plan.tasks.reduce((s, t) => s + t.durationMin, 0)).toBeLessThanOrEqual(weekly);
  });

  it("desconta o tempo já usado por tarefas concluídas no dia", () => {
    const plan = ok(generateCycle(input({ usedMinutesByDate: { [TODAY]: 100 } })));
    expect(minutesByDate(plan.tasks).get(TODAY) ?? 0).toBeLessThanOrEqual(20);
  });

  it("nenhuma tarefa tem duração menor ou igual a zero", () => {
    const plan = ok(generateCycle(input({ weeklyAvailability: { ...WEEK, "1": 65 } })));
    expect(plan.tasks.length).toBeGreaterThan(0);
    for (const task of plan.tasks) expect(task.durationMin).toBeGreaterThan(0);
  });

  it("garante ao menos 1 bloco por disciplina ativa", () => {
    const plan = ok(generateCycle(input()));
    const subjects = new Set(plan.tasks.map((t) => t.subjectId));
    for (const s of ["port", "dadm", "rlm"]) expect(subjects).toContain(s);
  });

  it("quando não cabe todas as disciplinas, exibe conflito em vez de estourar o tempo", () => {
    const tiny: WeeklyAvailability = { "0": 0, "1": 50, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    const plan = ok(generateCycle(input({ weeklyAvailability: tiny })));
    expect(plan.tasks).toHaveLength(1);
    expect(plan.conflicts.map((c) => c.code)).toContain("SUBJECT_WITHOUT_BLOCK");
  });

  it("reserva fatia para revisões vencidas, e elas vêm primeiro", () => {
    const topics = baseTopics.map((t) =>
      t.id === "t5" ? { ...t, overdueReviews: 3, lastStudiedAt: "2026-10-01" } : t,
    );
    const plan = ok(generateCycle(input({ topics })));
    const first = plan.tasks[0];
    expect(first?.type).toBe("revisao");
    expect(first?.topicId).toBe("t5");
    expect(first?.justification).toMatch(/revisão\(ões\) vencida/);
  });

  it("redistribui pendentes do ciclo anterior primeiro; o que não couber vira conflito", () => {
    const tiny: WeeklyAvailability = { "0": 0, "1": 100, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    const carryOver = [
      { topicId: "t1", type: "teoria" as const },
      { topicId: "t3", type: "questoes" as const },
      { topicId: "t5", type: "teoria" as const },
    ];
    const plan = ok(generateCycle(input({ weeklyAvailability: tiny, carryOver })));
    expect(plan.tasks.map((t) => t.topicId)).toEqual(["t1", "t3"]);
    const conflict = plan.conflicts.find((c) => c.code === "CARRY_OVER_NOT_SCHEDULED");
    expect(conflict?.ids).toEqual(["t5"]);
  });

  it("é determinístico: mesma entrada (em qualquer ordem) → mesmo ciclo", () => {
    const a = generateCycle(input());
    const b = generateCycle(input());
    const c = generateCycle(input({ topics: [...baseTopics].reverse() }));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("toda tarefa tem justificativa legível com os números usados", () => {
    const topics = baseTopics.map((t) => (t.id === "t3" ? { ...t, attempts: 20, correct: 8 } : t));
    const plan = ok(generateCycle(input({ topics })));
    for (const task of plan.tasks) expect(task.justification.length).toBeGreaterThan(20);
    const t3 = plan.tasks.find((t) => t.topicId === "t3");
    expect(t3?.justification).toMatch(/Acerto de 40% em 20 questões/);
  });
});

describe("casos de borda com mensagens claras", () => {
  it("edital vazio", () => {
    const result = generateCycle(input({ topics: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("NO_TOPICS");
  });

  it("zero horas na semana", () => {
    const zero: WeeklyAvailability = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    const result = generateCycle(input({ weeklyAvailability: zero }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("NO_AVAILABILITY");
  });

  it("menos de 15 minutos num dia não vira bloco", () => {
    expect(buildSlots(TODAY, { ...WEEK, "1": 10 }, 50).filter((s) => s.date === TODAY)).toHaveLength(0);
  });

  it("prova no passado", () => {
    const result = generateCycle(input({ examDate: addDays(TODAY, -1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("EXAM_IN_PAST");
      expect(result.issues[0]?.message).toContain("25/10/2026");
    }
  });

  it("peso zero em uma disciplina gera aviso, mas ela mantém o bloco mínimo", () => {
    const topics = baseTopics.map((t) => (t.subjectId === "rlm" ? { ...t, subjectWeight: 0 } : t));
    const plan = ok(generateCycle(input({ topics })));
    expect(plan.warnings.map((w) => w.code)).toContain("ZERO_WEIGHT_SUBJECT");
    expect(plan.tasks.some((t) => t.subjectId === "rlm")).toBe(true);
  });

  it("todos os pesos zero ainda geram ciclo, com aviso", () => {
    const topics = baseTopics.map((t) => ({ ...t, subjectWeight: 0 }));
    const plan = ok(generateCycle(input({ topics })));
    expect(plan.warnings.map((w) => w.code)).toContain("ALL_WEIGHTS_ZERO");
    expect(plan.tasks.length).toBeGreaterThan(0);
  });

  it("bloco com duração inválida", () => {
    const result = generateCycle(input({ blockMinutes: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("INVALID_BLOCK");
  });
});

describe("fases por proximidade da prova", () => {
  it("sem data = base; >90 = inicial; 30–90 = intermediária; <30 = reta final", () => {
    expect(phaseFor(TODAY, null).phase).toBe("base");
    expect(phaseFor(TODAY, addDays(TODAY, 120)).phase).toBe("inicial");
    expect(phaseFor(TODAY, addDays(TODAY, 90)).phase).toBe("intermediaria");
    expect(phaseFor(TODAY, addDays(TODAY, 30)).phase).toBe("intermediaria");
    expect(phaseFor(TODAY, addDays(TODAY, 29)).phase).toBe("reta_final");
    expect(phaseFor(TODAY, TODAY).phase).toBe("reta_final");
  });

  it("reta final inclui 1 simulado e mais revisão", () => {
    const studied = baseTopics.map((t) => ({ ...t, covered: true, lastStudiedAt: "2026-10-10" }));
    const final = ok(generateCycle(input({ topics: studied, examDate: addDays(TODAY, 20) })));
    const early = ok(generateCycle(input({ topics: studied, examDate: addDays(TODAY, 200) })));
    expect(final.tasks.filter((t) => t.type === "simulado")).toHaveLength(1);
    expect(early.tasks.filter((t) => t.type === "simulado")).toHaveLength(0);
    const reviews = (p: typeof final) => p.tasks.filter((t) => t.type === "revisao").length;
    expect(reviews(final)).toBeGreaterThan(reviews(early));
  });
});

describe("ajuste pelo tipo de erro", () => {
  const covered = { covered: true, lastStudiedAt: "2026-10-20" };

  it("assunto não estudado começa pela teoria", () => {
    const plan = ok(generateCycle(input()));
    const firstOfT4 = plan.tasks.find((t) => t.topicId === "t4");
    expect(firstOfT4?.type).toBe("teoria");
  });

  it("pegadinha da banca → questões; esquecimento → revisão curta", () => {
    const topics = [
      topic("a", "s1", { ...covered, errorCounts: { pegadinha_da_banca: 3 } }),
      topic("b", "s2", { ...covered, errorCounts: { esquecimento: 4 } }),
    ];
    const plan = ok(generateCycle(input({ topics, blockMinutes: 60 })));
    const a = plan.tasks.find((t) => t.topicId === "a" && t.type !== "revisao");
    const b = plan.tasks.find((t) => t.topicId === "b" && t.justification.includes("esquecimento"));
    expect(a?.type).toBe("questoes");
    expect(a?.justification).toMatch(/mesma banca/);
    expect(b?.type).toBe("revisao");
    expect(b?.durationMin).toBe(30);
  });

  it("muitos erros → análise de erros", () => {
    const topics = [topic("a", "s1", { ...covered, errorCounts: { falta_de_atencao: 3, interpretacao: 3 } })];
    const plan = ok(generateCycle(input({ topics })));
    expect(plan.tasks.some((t) => t.type === "analise_erros")).toBe(true);
  });

  it("acerto baixo gera mais blocos que acerto alto (ajuste dinâmico)", () => {
    const topics = [
      topic("fraco", "s1", { ...covered, attempts: 20, correct: 6 }),
      topic("forte", "s2", { ...covered, attempts: 20, correct: 19 }),
    ];
    const plan = ok(generateCycle(input({ topics })));
    const count = (id: string) => plan.tasks.filter((t) => t.topicId === id).length;
    expect(count("fraco")).toBeGreaterThan(count("forte"));
  });
});
