import { describe, expect, it } from "vitest";
import { CEBRASPE_RULE, scoreMockExam, STANDARD_RULE, type ScoredAnswer } from "./scoring";

const answers: ScoredAnswer[] = [
  { subjectId: "port", topicId: "a", correct: true, timeSpentSec: 60 },
  { subjectId: "port", topicId: "a", correct: true, timeSpentSec: 90 },
  { subjectId: "port", topicId: "b", correct: false, timeSpentSec: 30 },
  { subjectId: "dadm", topicId: "c", correct: null },
  { subjectId: "dadm", topicId: "c", correct: false },
];

describe("scoreMockExam", () => {
  it("regra padrão: nota = acertos", () => {
    const r = scoreMockExam(answers, STANDARD_RULE);
    expect(r).toMatchObject({
      total: 5,
      correct: 2,
      wrong: 2,
      blank: 1,
      score: 2,
      maxScore: 5,
      accuracy: 50,
    });
    expect(r.averageTimeSec).toBe(60);
  });

  it("Cebraspe: cada errada anula uma certa; branco não desconta", () => {
    expect(scoreMockExam(answers, CEBRASPE_RULE).score).toBe(0);
    const better = answers.map((a, i) => (i === 4 ? { ...a, correct: null } : a));
    expect(scoreMockExam(better, CEBRASPE_RULE).score).toBe(1);
  });

  it("nota líquida nunca fica negativa", () => {
    const allWrong = answers.map((a) => ({ ...a, correct: false }));
    expect(scoreMockExam(allWrong, CEBRASPE_RULE).score).toBe(0);
  });

  it("agrupa por disciplina e assunto", () => {
    const r = scoreMockExam(answers);
    expect(r.bySubject.port).toMatchObject({ total: 3, correct: 2, accuracy: 66.7 });
    expect(r.bySubject.dadm).toMatchObject({ total: 2, blank: 1, accuracy: 0 });
    expect(r.byTopic.c?.accuracy).toBe(0);
  });

  it("simulado vazio não quebra", () => {
    expect(scoreMockExam([])).toMatchObject({ total: 0, score: 0, accuracy: null, averageTimeSec: null });
  });
});
