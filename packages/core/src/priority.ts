import { daysBetween, type IsoDate } from "./dates";
import type { ErrorType, PriorityWeights } from "./types";

/**
 * Pesos iniciais da prioridade. São parâmetros de partida definidos pelo produto,
 * NÃO validados cientificamente; o usuário (e o admin, no padrão global) pode ajustar.
 */
export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  importance: 0.35,
  difficulty: 0.35,
  review: 0.15,
  incidence: 0.1,
  coverage: 0.05,
};

/** Mínimo de questões respondidas para usar a taxa de acerto real em vez da autoavaliação. */
export const MIN_ATTEMPTS_FOR_ACCURACY = 10;
/** Dias sem estudar para a necessidade de revisão chegar ao máximo. */
export const REVIEW_SATURATION_DAYS = 30;
/** Incidência usada quando ainda não há dados da banca. */
export const UNKNOWN_INCIDENCE = 0.5;

export interface TopicSignals {
  subjectWeight: number;
  /** Relevância do assunto no edital, 1 a 5. */
  relevance: number;
  /** Autoavaliação 0–100 (null = não informada). */
  selfAssessment: number | null;
  attempts: number;
  correct: number;
  lastStudiedAt: IsoDate | null;
  /** Frequência do assunto nas provas da banca, 0–1 (null = desconhecida). */
  boardIncidence: number | null;
  covered: boolean;
  errorCounts?: Partial<Record<ErrorType, number>>;
}

export interface PriorityFactors {
  importance: number;
  difficulty: number;
  review: number;
  incidence: number;
  coverage: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Normaliza os pesos para somarem 1. Pesos inválidos ou todos zero caem no padrão. */
export function normalizeWeights(weights?: Partial<PriorityWeights> | null): PriorityWeights {
  const merged = { ...DEFAULT_PRIORITY_WEIGHTS, ...(weights ?? {}) };
  const values = Object.values(merged);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return DEFAULT_PRIORITY_WEIGHTS;
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return DEFAULT_PRIORITY_WEIGHTS;
  return {
    importance: merged.importance / sum,
    difficulty: merged.difficulty / sum,
    review: merged.review / sum,
    incidence: merged.incidence / sum,
    coverage: merged.coverage / sum,
  };
}

/** Peso bruto do assunto no edital (peso da disciplina × relevância), antes de normalizar. */
export function rawImportance(topic: Pick<TopicSignals, "subjectWeight" | "relevance">): number {
  return Math.max(0, topic.subjectWeight) * (clamp01(topic.relevance / 5) || 0);
}

export function accuracyOf(topic: Pick<TopicSignals, "attempts" | "correct">): number | null {
  if (topic.attempts < MIN_ATTEMPTS_FOR_ACCURACY) return null;
  return clamp01(topic.correct / topic.attempts);
}

/**
 * Fatores normalizados (0–1). `maxRawImportance` é o maior peso bruto entre os assuntos do plano,
 * usado para normalizar a importância.
 */
export function computeFactors(
  topic: TopicSignals,
  today: IsoDate,
  maxRawImportance: number,
): PriorityFactors {
  const importance = maxRawImportance > 0 ? rawImportance(topic) / maxRawImportance : 0;

  const accuracy = accuracyOf(topic);
  const difficulty =
    accuracy !== null
      ? 1 - accuracy
      : topic.selfAssessment !== null
        ? 1 - clamp01(topic.selfAssessment / 100)
        : 0.5;

  const review = topic.lastStudiedAt
    ? clamp01(daysBetween(topic.lastStudiedAt, today) / REVIEW_SATURATION_DAYS)
    : 1;

  const incidence = topic.boardIncidence === null ? UNKNOWN_INCIDENCE : clamp01(topic.boardIncidence);
  const coverage = topic.covered ? 0 : 1;

  return { importance, difficulty, review, incidence, coverage };
}

export function priorityScore(factors: PriorityFactors, weights: PriorityWeights): number {
  const score =
    weights.importance * factors.importance +
    weights.difficulty * factors.difficulty +
    weights.review * factors.review +
    weights.incidence * factors.incidence +
    weights.coverage * factors.coverage;
  // Arredonda para evitar diferenças de ponto flutuante quebrarem o determinismo da ordenação.
  return Math.round(score * 10_000) / 10_000;
}
