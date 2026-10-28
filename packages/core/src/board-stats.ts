// Raio-X da banca: incidência de cada assunto nas provas analisadas (só itens revisados por humano).

export interface BoardStatItem {
  examId: string;
  year: number;
  topicId: string | null;
  annulled: boolean;
}

export type Trend = "subindo" | "caindo" | "estavel";

export interface TopicIncidence {
  topicId: string;
  questionCount: number;
  /** Em quantas provas o assunto apareceu. */
  examCount: number;
  /** Fração das questões (não anuladas) da banca que caíram neste assunto, 0–1. */
  share: number;
  /** null quando a amostra não permite comparar períodos. */
  trend: Trend | null;
}

export interface BoardStats {
  exams: number;
  yearFrom: number | null;
  yearTo: number | null;
  totalQuestions: number;
  topics: TopicIncidence[];
}

/** Abaixo disso, o Raio-X avisa que a amostra é pequena. */
export const SMALL_SAMPLE_EXAMS = 5;
/** Mínimo de provas para a incidência entrar no planejador. */
export const MIN_EXAMS_FOR_PLANNER = 3;
/** Diferença de participação (pontos percentuais / 100) para considerar tendência. */
const TREND_THRESHOLD = 0.03;

export function computeBoardStats(items: BoardStatItem[]): BoardStats {
  const valid = items.filter((i) => !i.annulled);
  const examYears = new Map<string, number>();
  for (const i of items) examYears.set(i.examId, i.year);
  const years = [...examYears.values()];
  const yearFrom = years.length ? Math.min(...years) : null;
  const yearTo = years.length ? Math.max(...years) : null;

  // Períodos para tendência: provas dos 2 anos mais recentes × anteriores (cada lado com 2+ provas).
  const recentYear = yearTo === null ? null : yearTo - 1;
  const isRecent = (examId: string) => recentYear !== null && (examYears.get(examId) ?? 0) >= recentYear;
  const recentExams = [...examYears.keys()].filter(isRecent);
  const olderExams = [...examYears.keys()].filter((id) => !isRecent(id));
  const canTrend = recentExams.length >= 2 && olderExams.length >= 2;
  const recentTotal = valid.filter((i) => isRecent(i.examId)).length;
  const olderTotal = valid.length - recentTotal;

  const byTopic = new Map<string, BoardStatItem[]>();
  for (const i of valid) {
    if (!i.topicId) continue;
    byTopic.set(i.topicId, [...(byTopic.get(i.topicId) ?? []), i]);
  }

  const topics: TopicIncidence[] = [...byTopic].map(([topicId, list]) => {
    let trend: Trend | null = null;
    if (canTrend && recentTotal > 0 && olderTotal > 0) {
      const recentShare = list.filter((i) => isRecent(i.examId)).length / recentTotal;
      const olderShare = list.filter((i) => !isRecent(i.examId)).length / olderTotal;
      const diff = recentShare - olderShare;
      trend = diff > TREND_THRESHOLD ? "subindo" : diff < -TREND_THRESHOLD ? "caindo" : "estavel";
    }
    return {
      topicId,
      questionCount: list.length,
      examCount: new Set(list.map((i) => i.examId)).size,
      share: valid.length ? Math.round((list.length / valid.length) * 10_000) / 10_000 : 0,
      trend,
    };
  });
  topics.sort((a, b) => b.share - a.share || (a.topicId < b.topicId ? -1 : 1));
  return { exams: examYears.size, yearFrom, yearTo, totalQuestions: valid.length, topics };
}

/**
 * Converte o Raio-X em "incidência na banca" (0–1) para os assuntos do plano: normalizado pelo
 * assunto mais cobrado entre eles. Assunto do edital que nunca caiu recebe 0 (peso menor, não some).
 * Com amostra insuficiente devolve mapa vazio (o planejador usa 0,5 = desconhecido).
 */
export function incidenceForTopics(
  stats: BoardStats,
  topicIds: string[],
  minExams = MIN_EXAMS_FOR_PLANNER,
): Map<string, number> {
  const result = new Map<string, number>();
  if (stats.exams < minExams || topicIds.length === 0) return result;
  // Normaliza pelas contagens (não pelas participações arredondadas) para não perder precisão.
  const counts = new Map(stats.topics.map((t) => [t.topicId, t.questionCount]));
  const max = Math.max(0, ...topicIds.map((id) => counts.get(id) ?? 0));
  for (const id of topicIds) {
    const count = counts.get(id) ?? 0;
    result.set(id, max > 0 ? Math.round((count / max) * 10_000) / 10_000 : 0);
  }
  return result;
}
