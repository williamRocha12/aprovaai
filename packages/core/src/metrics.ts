// Métricas do dashboard, calculadas a partir de dados persistidos (funções puras).
import { addDays, daysBetween, weekdayOf, type IsoDate } from "./dates";

/** Dias seguidos com estudo até hoje (ontem conta se hoje ainda não houve estudo). */
export function studyStreak(activeDays: Iterable<IsoDate>, today: IsoDate): number {
  const days = new Set(activeDays);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Segunda-feira da semana da data. */
export function weekStartOf(date: IsoDate): IsoDate {
  const offset = (weekdayOf(date) + 6) % 7;
  return addDays(date, -offset);
}

export interface AttemptPoint {
  date: IsoDate;
  correct: boolean;
}

export interface WeeklyAccuracy {
  weekStart: IsoDate;
  answered: number;
  correct: number;
  /** % de acerto (0–100) ou null em semana sem questões. */
  accuracy: number | null;
}

/** Evolução semanal das últimas `weeks` semanas (inclui semanas vazias, para o gráfico não mentir). */
export function weeklyAccuracy(attempts: AttemptPoint[], today: IsoDate, weeks = 8): WeeklyAccuracy[] {
  const currentWeek = weekStartOf(today);
  const result: WeeklyAccuracy[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(currentWeek, -7 * i);
    const inWeek = attempts.filter((a) => {
      const diff = daysBetween(weekStart, a.date);
      return diff >= 0 && diff < 7;
    });
    const correct = inWeek.filter((a) => a.correct).length;
    result.push({
      weekStart,
      answered: inWeek.length,
      correct,
      accuracy: inWeek.length === 0 ? null : Math.round((correct / inWeek.length) * 1000) / 10,
    });
  }
  return result;
}

export interface TopicAccuracy {
  id: string;
  name: string;
  subjectName: string;
  /** Peso relativo no edital (peso da disciplina × relevância). */
  weight: number;
  answered: number;
  correct: number;
}

/**
 * Os piores assuntos com peso alto: só entram assuntos com amostra mínima e peso
 * acima da mediana; ordena pelo menor acerto (desempate pelo maior peso).
 */
export function worstHighWeightTopics(topics: TopicAccuracy[], limit = 5, minAnswered = 5): TopicAccuracy[] {
  const withSample = topics.filter((t) => t.answered >= minAnswered);
  if (withSample.length === 0) return [];
  const weights = [...withSample.map((t) => t.weight)].sort((a, b) => a - b);
  const median = weights[Math.floor((weights.length - 1) / 2)] ?? 0;
  const rate = (t: TopicAccuracy) => t.correct / t.answered;
  return withSample
    .filter((t) => t.weight >= median)
    .sort((a, b) => rate(a) - rate(b) || b.weight - a.weight || (a.id < b.id ? -1 : 1))
    .slice(0, limit);
}
