// Revisão espaçada do caderno de erros.
// Errou → entra na fila (ou volta ao início). Acertou na revisão → avança um estágio.
// Passou do último intervalo (padrão: 30 dias) → "dominada".
import { addDays, daysBetween, type IsoDate } from "./dates";

export const DEFAULT_REVIEW_INTERVALS = [1, 7, 30] as const;

export type ReviewStatus = "ativa" | "dominada";

export interface ReviewState {
  /** Índice do intervalo atual em `intervals`. */
  stage: number;
  dueDate: IsoDate;
  status: ReviewStatus;
}

export function validateIntervals(intervals: readonly number[]): number[] {
  const valid = intervals.filter((n) => Number.isInteger(n) && n > 0);
  const sorted = [...new Set(valid)].sort((a, b) => a - b);
  return sorted.length > 0 ? sorted : [...DEFAULT_REVIEW_INTERVALS];
}

/**
 * Próximo estado após uma tentativa. `current` = null quando a questão ainda não está na fila.
 * Devolve null se a questão não deve entrar na fila (acertou e nunca tinha errado).
 */
export function nextReviewState(
  current: ReviewState | null,
  correct: boolean,
  today: IsoDate,
  intervals: readonly number[] = DEFAULT_REVIEW_INTERVALS,
): ReviewState | null {
  const steps = validateIntervals(intervals);
  const first = steps[0] as number;
  if (!correct) return { stage: 0, dueDate: addDays(today, first), status: "ativa" };
  if (!current) return null;
  if (current.status === "dominada") return current;

  const nextStage = current.stage + 1;
  const nextInterval = steps[nextStage];
  if (nextInterval === undefined)
    return { stage: current.stage, dueDate: current.dueDate, status: "dominada" };
  return { stage: nextStage, dueDate: addDays(today, nextInterval), status: "ativa" };
}

export type ReviewBucket = "hoje" | "atrasada" | "futura" | "concluida";

export function reviewBucket(state: ReviewState, today: IsoDate): ReviewBucket {
  if (state.status === "dominada") return "concluida";
  const diff = daysBetween(today, state.dueDate);
  if (diff < 0) return "atrasada";
  if (diff === 0) return "hoje";
  return "futura";
}
