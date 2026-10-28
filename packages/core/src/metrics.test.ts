import { describe, expect, it } from "vitest";
import {
  studyStreak,
  weekStartOf,
  weeklyAccuracy,
  worstHighWeightTopics,
  type TopicAccuracy,
} from "./metrics";

describe("studyStreak", () => {
  it("conta dias seguidos até hoje", () => {
    expect(studyStreak(["2026-10-26", "2026-10-27", "2026-10-28"], "2026-10-28")).toBe(3);
  });

  it("se hoje ainda não estudou, a sequência de ontem continua valendo", () => {
    expect(studyStreak(["2026-10-26", "2026-10-27"], "2026-10-28")).toBe(2);
  });

  it("um dia sem estudo quebra a sequência; sem dados = 0", () => {
    expect(studyStreak(["2026-10-25", "2026-10-27"], "2026-10-28")).toBe(1);
    expect(studyStreak([], "2026-10-28")).toBe(0);
  });
});

describe("weeklyAccuracy", () => {
  it("agrupa por semana (segunda a domingo) e mantém semanas vazias", () => {
    expect(weekStartOf("2026-10-28")).toBe("2026-10-26");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
    const weeks = weeklyAccuracy(
      [
        { date: "2026-10-26", correct: true },
        { date: "2026-10-28", correct: false },
        { date: "2026-10-20", correct: true },
      ],
      "2026-10-28",
      3,
    );
    expect(weeks).toEqual([
      { weekStart: "2026-10-12", answered: 0, correct: 0, accuracy: null },
      { weekStart: "2026-10-19", answered: 1, correct: 1, accuracy: 100 },
      { weekStart: "2026-10-26", answered: 2, correct: 1, accuracy: 50 },
    ]);
  });
});

describe("worstHighWeightTopics", () => {
  const topic = (id: string, weight: number, answered: number, correct: number): TopicAccuracy => ({
    id,
    name: id,
    subjectName: "S",
    weight,
    answered,
    correct,
  });

  it("ignora amostras pequenas e pesos abaixo da mediana", () => {
    const result = worstHighWeightTopics([
      topic("pouca-amostra", 10, 2, 0),
      topic("peso-baixo", 1, 10, 1),
      topic("alto-ruim", 10, 10, 3),
      topic("alto-bom", 10, 10, 9),
    ]);
    expect(result.map((t) => t.id)).toEqual(["alto-ruim", "alto-bom"]);
  });

  it("lista vazia não quebra", () => {
    expect(worstHighWeightTopics([])).toEqual([]);
  });
});
