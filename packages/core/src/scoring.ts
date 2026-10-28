// Pontuação de simulados conforme a regra do edital.

export type ScoringType = "standard" | "wrong_cancels_right";

export interface ScoringRule {
  type: ScoringType;
  /** Quantas certas uma errada anula (Cebraspe: 1). Ignorado no padrão. */
  wrongPenalty: number;
  /** Pontos por questão certa. */
  pointsPerQuestion: number;
}

export const STANDARD_RULE: ScoringRule = { type: "standard", wrongPenalty: 0, pointsPerQuestion: 1 };
export const CEBRASPE_RULE: ScoringRule = {
  type: "wrong_cancels_right",
  wrongPenalty: 1,
  pointsPerQuestion: 1,
};

export interface ScoredAnswer {
  subjectId: string;
  topicId: string | null;
  /** null = em branco. */
  correct: boolean | null;
  timeSpentSec?: number;
}

export interface GroupScore {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  /** % de acerto sobre as respondidas (0–100), null se nenhuma respondida. */
  accuracy: number | null;
}

export interface MockExamScore extends GroupScore {
  score: number;
  maxScore: number;
  averageTimeSec: number | null;
  bySubject: Record<string, GroupScore>;
  byTopic: Record<string, GroupScore>;
}

function group(answers: ScoredAnswer[]): GroupScore {
  const correct = answers.filter((a) => a.correct === true).length;
  const wrong = answers.filter((a) => a.correct === false).length;
  const answered = correct + wrong;
  return {
    total: answers.length,
    correct,
    wrong,
    blank: answers.length - answered,
    accuracy: answered === 0 ? null : Math.round((correct / answered) * 1000) / 10,
  };
}

function groupBy(
  answers: ScoredAnswer[],
  key: (a: ScoredAnswer) => string | null,
): Record<string, GroupScore> {
  const buckets = new Map<string, ScoredAnswer[]>();
  for (const answer of answers) {
    const k = key(answer);
    if (k === null) continue;
    buckets.set(k, [...(buckets.get(k) ?? []), answer]);
  }
  return Object.fromEntries(
    [...buckets].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, list]) => [k, group(list)]),
  );
}

export function scoreMockExam(answers: ScoredAnswer[], rule: ScoringRule = STANDARD_RULE): MockExamScore {
  const overall = group(answers);
  const penalty = rule.type === "wrong_cancels_right" ? Math.max(0, rule.wrongPenalty) : 0;
  // Nota líquida não fica negativa (regra usual dos editais).
  const score = Math.max(0, (overall.correct - overall.wrong * penalty) * rule.pointsPerQuestion);
  const timed = answers.filter((a) => typeof a.timeSpentSec === "number");
  return {
    ...overall,
    score: Math.round(score * 100) / 100,
    maxScore: answers.length * rule.pointsPerQuestion,
    averageTimeSec:
      timed.length === 0
        ? null
        : Math.round(timed.reduce((s, a) => s + (a.timeSpentSec ?? 0), 0) / timed.length),
    bySubject: groupBy(answers, (a) => a.subjectId),
    byTopic: groupBy(answers, (a) => a.topicId),
  };
}
