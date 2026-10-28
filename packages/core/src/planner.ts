// Motor do Ciclo de Estudos Dinâmico. Função pura: mesma entrada → mesmo ciclo.
import { addDays, daysBetween, formatDateBr, weekdayOf, type IsoDate } from "./dates";
import {
  accuracyOf,
  computeFactors,
  normalizeWeights,
  priorityScore,
  rawImportance,
  type PriorityFactors,
  type TopicSignals,
} from "./priority";
import {
  ERROR_TYPES,
  type ErrorType,
  type Phase,
  type PriorityWeights,
  type TaskType,
  type WeeklyAvailability,
} from "./types";

export const CYCLE_DAYS = 7;
export const MIN_BLOCK_MINUTES = 15;
export const MAX_BLOCK_MINUTES = 240;

/** Fatia do ciclo reservada para revisão, por fase. */
export const REVIEW_SHARE: Record<Phase, number> = {
  base: 0.2,
  inicial: 0.2,
  intermediaria: 0.35,
  reta_final: 0.5,
};

export interface PlannerTopic extends TopicSignals {
  id: string;
  subjectId: string;
  subjectName: string;
  topicName: string;
  /** Itens de revisão espaçada vencidos neste assunto. */
  overdueReviews: number;
}

/** Tarefa pendente de um ciclo anterior que deve ser reaproveitada antes de qualquer outra. */
export interface CarryOverTask {
  topicId: string;
  type: TaskType;
}

export interface PlannerInput {
  today: IsoDate;
  examDate: IsoDate | null;
  weeklyAvailability: WeeklyAvailability;
  blockMinutes: number;
  weights?: Partial<PriorityWeights> | null;
  topics: PlannerTopic[];
  /** Minutos já consumidos por tarefas concluídas em cada data (não podem ser contados de novo). */
  usedMinutesByDate?: Record<IsoDate, number>;
  carryOver?: CarryOverTask[];
}

export interface PlannedTask {
  /** null em blocos de simulado (cobrem várias disciplinas). */
  topicId: string | null;
  subjectId: string | null;
  type: TaskType;
  date: IsoDate;
  order: number;
  durationMin: number;
  priority: number;
  justification: string;
}

export type PlanIssueCode = "NO_TOPICS" | "NO_AVAILABILITY" | "EXAM_IN_PAST" | "INVALID_BLOCK";
export type PlanWarningCode = "ZERO_WEIGHT_SUBJECT" | "ALL_WEIGHTS_ZERO" | "NO_EXAM_DATE";
export type PlanConflictCode = "SUBJECT_WITHOUT_BLOCK" | "CARRY_OVER_NOT_SCHEDULED";

export interface PlanMessage<C extends string> {
  code: C;
  message: string;
}
export interface PlanConflict extends PlanMessage<PlanConflictCode> {
  ids: string[];
}

export type PlanResult =
  | {
      ok: true;
      phase: Phase;
      daysToExam: number | null;
      reviewShare: number;
      startDate: IsoDate;
      endDate: IsoDate;
      tasks: PlannedTask[];
      conflicts: PlanConflict[];
      warnings: PlanMessage<PlanWarningCode>[];
    }
  | { ok: false; issues: PlanMessage<PlanIssueCode>[] };

interface Slot {
  date: IsoDate;
  durationMin: number;
}

interface Draft {
  topic: PlannerTopic | null;
  type: TaskType;
  priority: number;
  reason: string;
  /** Duração desejada (revisão curta usa menos que o bloco). */
  maxMinutes?: number;
  rank: number;
}

const LAW_SUBJECT = /direito|legisla|regimento|estatuto|lei\b/i;

export function phaseFor(
  today: IsoDate,
  examDate: IsoDate | null,
): { phase: Phase; daysToExam: number | null } {
  if (!examDate) return { phase: "base", daysToExam: null };
  const daysToExam = daysBetween(today, examDate);
  if (daysToExam < 30) return { phase: "reta_final", daysToExam };
  if (daysToExam <= 90) return { phase: "intermediaria", daysToExam };
  return { phase: "inicial", daysToExam };
}

/** Quebra a disponibilidade de cada dia em blocos, sem nunca passar do limite do dia. */
export function buildSlots(
  today: IsoDate,
  availability: WeeklyAvailability,
  blockMinutes: number,
  used: Record<IsoDate, number> = {},
): Slot[] {
  const slots: Slot[] = [];
  for (let offset = 0; offset < CYCLE_DAYS; offset++) {
    const date = addDays(today, offset);
    const dayKey = String(weekdayOf(date)) as keyof WeeklyAvailability;
    let remaining = Math.max(0, Math.floor(availability[dayKey] ?? 0) - Math.max(0, used[date] ?? 0));
    while (remaining >= MIN_BLOCK_MINUTES) {
      const durationMin = Math.min(blockMinutes, remaining);
      slots.push({ date, durationMin });
      remaining -= durationMin;
    }
  }
  return slots;
}

function dominantError(counts: Partial<Record<ErrorType, number>> | undefined): {
  type: ErrorType | null;
  total: number;
} {
  let total = 0;
  let best: ErrorType | null = null;
  let bestCount = 0;
  for (const type of ERROR_TYPES) {
    const n = counts?.[type] ?? 0;
    total += n;
    if (n > bestCount) {
      best = type;
      bestCount = n;
    }
  }
  return { type: total >= 3 ? best : null, total };
}

/** Escolhe o tipo do k-ésimo bloco de estudo do assunto no ciclo, a partir dos erros e do desempenho. */
function chooseStudyType(
  topic: PlannerTopic,
  k: number,
  factors: PriorityFactors,
): { type: TaskType; reason: string; maxMinutes?: number; shortReview?: boolean } {
  const { type: dominant, total } = dominantError(topic.errorCounts);
  if (k === 0 && total >= 5) {
    return {
      type: "analise_erros",
      reason: `Você acumulou ${total} erros neste assunto: revise o caderno de erros.`,
    };
  }
  if (!topic.covered && k === 0)
    return { type: "teoria", reason: "Assunto ainda não estudado: comece pela teoria." };

  switch (dominant) {
    case "falta_de_teoria":
    case "chute":
      return { type: "teoria", reason: "Seus erros indicam falta de base teórica: reforce a teoria." };
    case "pegadinha_da_banca":
      return { type: "questoes", reason: "Erros por pegadinha da banca: resolva questões da mesma banca." };
    case "falta_de_atencao":
    case "interpretacao":
      return { type: "questoes", reason: "Erros de atenção/interpretação: faça questões cronometradas." };
    case "esquecimento":
      return {
        type: "revisao",
        reason: "Erros por esquecimento: revisão curta do assunto.",
        shortReview: true,
      };
    default:
      break;
  }
  if (LAW_SUBJECT.test(topic.subjectName) && k % 2 === 1) {
    return { type: "lei_seca", reason: "Disciplina de base legal: leitura da lei seca." };
  }
  if (k === 0 && factors.difficulty > 0.6) {
    return { type: "teoria", reason: "Desempenho baixo: reforce a teoria antes das questões." };
  }
  return { type: "questoes", reason: "Fixe o conteúdo com questões." };
}

/** Frase com os números que levaram à prioridade ("Acerto de 42% em 20 questões, peso alto no edital"). */
function factsSentence(topic: PlannerTopic, factors: PriorityFactors, today: IsoDate): string {
  const parts: string[] = [];
  const accuracy = accuracyOf(topic);
  if (accuracy !== null) parts.push(`acerto de ${Math.round(accuracy * 100)}% em ${topic.attempts} questões`);
  else if (topic.selfAssessment !== null) parts.push(`autoavaliação de ${topic.selfAssessment}%`);
  else parts.push("sem questões respondidas ainda");

  if (rawImportance(topic) === 0) parts.push("peso zero no edital");
  else if (factors.importance >= 0.66) parts.push("peso alto no edital");
  else if (factors.importance >= 0.33) parts.push("peso médio no edital");
  else parts.push("peso baixo no edital");

  if (!topic.lastStudiedAt) parts.push("ainda não estudado");
  else {
    const days = daysBetween(topic.lastStudiedAt, today);
    if (days >= 14) parts.push(`${days} dias sem estudar`);
  }

  if (topic.boardIncidence !== null && topic.boardIncidence >= 0.6) parts.push("cai muito na banca");
  if (topic.boardIncidence === 0) parts.push("não apareceu nas provas analisadas da banca (peso menor)");

  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function generateCycle(input: PlannerInput): PlanResult {
  const issues: PlanMessage<PlanIssueCode>[] = [];
  if (input.topics.length === 0) {
    issues.push({
      code: "NO_TOPICS",
      message: "O edital não tem assuntos ativos. Ative ao menos uma disciplina.",
    });
  }
  if (
    !Number.isInteger(input.blockMinutes) ||
    input.blockMinutes < MIN_BLOCK_MINUTES ||
    input.blockMinutes > MAX_BLOCK_MINUTES
  ) {
    issues.push({
      code: "INVALID_BLOCK",
      message: `A duração do bloco deve ficar entre ${MIN_BLOCK_MINUTES} e ${MAX_BLOCK_MINUTES} minutos.`,
    });
  }
  const { phase, daysToExam } = phaseFor(input.today, input.examDate);
  if (daysToExam !== null && daysToExam < 0 && input.examDate) {
    issues.push({
      code: "EXAM_IN_PAST",
      message: `A data da prova (${formatDateBr(input.examDate)}) já passou. Atualize a data ou remova-a para seguir na fase base.`,
    });
  }
  const slots =
    issues.length === 0
      ? buildSlots(input.today, input.weeklyAvailability, input.blockMinutes, input.usedMinutesByDate)
      : [];
  if (issues.length === 0 && slots.length === 0) {
    issues.push({
      code: "NO_AVAILABILITY",
      message:
        "Não há horas disponíveis nos próximos 7 dias. Informe quanto tempo você tem por dia da semana.",
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  // Ordem canônica: a ordem de chegada dos assuntos não pode mudar o resultado.
  const topics = [...input.topics].sort(byId);
  const topicById = new Map(topics.map((t) => [t.id, t]));
  const weights = normalizeWeights(input.weights);
  const maxRaw = Math.max(0, ...topics.map(rawImportance));
  const factors = new Map(topics.map((t) => [t.id, computeFactors(t, input.today, maxRaw)]));
  const priority = new Map(
    topics.map((t) => [t.id, priorityScore(factors.get(t.id) as PriorityFactors, weights)]),
  );
  const prio = (t: PlannerTopic) => priority.get(t.id) ?? 0;
  const byPriority = (a: PlannerTopic, b: PlannerTopic) => prio(b) - prio(a) || byId(a, b);

  const warnings: PlanMessage<PlanWarningCode>[] = [];
  const conflicts: PlanConflict[] = [];
  if (!input.examDate) {
    warnings.push({
      code: "NO_EXAM_DATE",
      message: "Sem data de prova: você está na fase base, com 20% do tempo para revisão.",
    });
  }
  if (maxRaw === 0) {
    warnings.push({
      code: "ALL_WEIGHTS_ZERO",
      message: "Nenhum assunto tem peso no edital: a prioridade usa só desempenho e revisão.",
    });
  } else {
    const zeroSubjects = [
      ...new Set(topics.filter((t) => rawImportance(t) === 0).map((t) => t.subjectName)),
    ].sort();
    if (zeroSubjects.length > 0) {
      warnings.push({
        code: "ZERO_WEIGHT_SUBJECT",
        message: `Peso zero no edital: ${zeroSubjects.join(", ")}. Essas disciplinas recebem só o bloco mínimo.`,
      });
    }
  }

  // --- Reserva de simulado (reta final): 1 por ciclo, no maior bloco (o mais tarde em caso de empate).
  const freeSlots = slots.map((slot, index) => ({ slot, index }));
  let simuladoSlotIndex: number | null = null;
  if (phase === "reta_final" && freeSlots.length > 1) {
    const best = freeSlots.reduce((a, b) => (b.slot.durationMin >= a.slot.durationMin ? b : a));
    simuladoSlotIndex = best.index;
  }
  const available = freeSlots.length - (simuladoSlotIndex === null ? 0 : 1);

  // --- Revisões: fatia da fase; revisões vencidas têm prioridade.
  const reviewShare = REVIEW_SHARE[phase];
  const overdue = topics
    .filter((t) => t.overdueReviews > 0)
    .sort((a, b) => b.overdueReviews - a.overdueReviews || byPriority(a, b));
  let reviewCount = Math.round(available * reviewShare);
  if (overdue.length > 0 && reviewCount === 0 && available > 1) reviewCount = 1;
  const reviewCandidates = [
    ...overdue,
    ...topics
      .filter((t) => t.overdueReviews === 0 && t.lastStudiedAt !== null)
      .sort((a, b) => {
        const fa = factors.get(a.id) as PriorityFactors;
        const fb = factors.get(b.id) as PriorityFactors;
        return fb.review * prio(b) - fa.review * prio(a) || byId(a, b);
      }),
  ];
  const reviewDrafts: Draft[] = reviewCandidates.slice(0, reviewCount).map((topic, i) => ({
    topic,
    type: "revisao",
    priority: prio(topic),
    reason:
      topic.overdueReviews > 0
        ? `${topic.overdueReviews} revisão(ões) vencida(s) no caderno de erros.`
        : "Revisão espaçada para não esquecer.",
    rank: i,
  }));

  let remaining = available - reviewDrafts.length;
  const studyDrafts: Draft[] = [];
  const blocksPerTopic = new Map<string, number>();
  const subjectsCovered = new Set(reviewDrafts.map((d) => d.topic?.subjectId));

  const addStudy = (topic: PlannerTopic, forcedType?: TaskType, forcedReason?: string) => {
    const k = blocksPerTopic.get(topic.id) ?? 0;
    const chosen = chooseStudyType(topic, k, factors.get(topic.id) as PriorityFactors);
    studyDrafts.push({
      topic,
      type: forcedType ?? chosen.type,
      priority: prio(topic),
      reason: forcedReason ?? chosen.reason,
      ...(chosen.shortReview && !forcedType
        ? { maxMinutes: Math.max(MIN_BLOCK_MINUTES, Math.round(input.blockMinutes / 2)) }
        : {}),
      rank: studyDrafts.length,
    });
    blocksPerTopic.set(topic.id, k + 1);
    subjectsCovered.add(topic.subjectId);
    remaining--;
  };

  // 1) Pendências de ciclos anteriores (redistribuídas antes de tudo; o que não couber vira conflito).
  const notScheduled: string[] = [];
  for (const carry of input.carryOver ?? []) {
    const topic = topicById.get(carry.topicId);
    if (!topic) continue;
    if (remaining <= 0) {
      notScheduled.push(topic.id);
      continue;
    }
    addStudy(topic, carry.type, "Pendente do ciclo anterior, reagendado.");
  }
  if (notScheduled.length > 0) {
    conflicts.push({
      code: "CARRY_OVER_NOT_SCHEDULED",
      message: `${notScheduled.length} tarefa(s) pendente(s) não couberam na sua disponibilidade desta semana.`,
      ids: notScheduled,
    });
  }

  // 2) Mínimo de 1 bloco por disciplina ativa.
  const bestBySubject = new Map<string, PlannerTopic>();
  for (const topic of [...topics].sort(byPriority)) {
    if (!bestBySubject.has(topic.subjectId)) bestBySubject.set(topic.subjectId, topic);
  }
  const subjectsInOrder = [...bestBySubject.values()].sort(byPriority);
  const withoutBlock: PlannerTopic[] = [];
  for (const topic of subjectsInOrder) {
    if (subjectsCovered.has(topic.subjectId)) continue;
    if (remaining > 0) addStudy(topic);
    else withoutBlock.push(topic);
  }
  if (withoutBlock.length > 0) {
    conflicts.push({
      code: "SUBJECT_WITHOUT_BLOCK",
      message: `Sua disponibilidade não cobre todas as disciplinas ativas nesta semana: ${withoutBlock
        .map((t) => t.subjectName)
        .join(", ")}. Aumente as horas ou desative disciplinas.`,
      ids: withoutBlock.map((t) => t.subjectId),
    });
  }

  // 3) Restante proporcional à prioridade (método D'Hondt: prioridade / (1 + blocos já dados)).
  while (remaining > 0) {
    let best: PlannerTopic | null = null;
    let bestScore = -1;
    for (const topic of topics) {
      const score = prio(topic) / (1 + (blocksPerTopic.get(topic.id) ?? 0));
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
    }
    if (!best) break;
    addStudy(best);
  }

  // --- Distribuição nos dias: revisões vencidas primeiro, depois prioridade; evita a mesma disciplina em sequência.
  const queue: Draft[] = [
    ...studyDrafts.filter((d) => d.reason.startsWith("Pendente")),
    ...reviewDrafts.filter((d) => (d.topic?.overdueReviews ?? 0) > 0),
    ...[
      ...studyDrafts.filter((d) => !d.reason.startsWith("Pendente")),
      ...reviewDrafts.filter((d) => (d.topic?.overdueReviews ?? 0) === 0),
    ].sort(
      (a, b) =>
        b.priority - a.priority ||
        ((a.topic?.id ?? "") < (b.topic?.id ?? "")
          ? -1
          : (a.topic?.id ?? "") > (b.topic?.id ?? "")
            ? 1
            : 0) ||
        a.rank - b.rank,
    ),
  ];

  const tasks: PlannedTask[] = [];
  let previous: { date: IsoDate; subjectId: string | null } | null = null;
  slots.forEach((slot, index) => {
    if (index === simuladoSlotIndex) {
      tasks.push({
        topicId: null,
        subjectId: null,
        type: "simulado",
        date: slot.date,
        order: tasks.length,
        durationMin: slot.durationMin,
        priority: 1,
        justification: "Reta final: um simulado por semana no formato da banca, com tempo de prova.",
      });
      previous = { date: slot.date, subjectId: null };
      return;
    }
    if (queue.length === 0) return;
    const prev = previous as { date: IsoDate; subjectId: string | null } | null;
    let pick = 0;
    if (prev && prev.date === slot.date) {
      const alternative = queue.findIndex((d) => d.topic?.subjectId !== prev.subjectId);
      if (alternative >= 0) pick = alternative;
    }
    const [draft] = queue.splice(pick, 1);
    if (!draft || !draft.topic) return;
    const topic = draft.topic;
    const durationMin = Math.min(slot.durationMin, draft.maxMinutes ?? slot.durationMin);
    tasks.push({
      topicId: topic.id,
      subjectId: topic.subjectId,
      type: draft.type,
      date: slot.date,
      order: tasks.length,
      durationMin,
      priority: draft.priority,
      justification: `${factsSentence(topic, factors.get(topic.id) as PriorityFactors, input.today)}. ${draft.reason}`,
    });
    previous = { date: slot.date, subjectId: topic.subjectId };
  });

  return {
    ok: true,
    phase,
    daysToExam,
    reviewShare,
    startDate: input.today,
    endDate: addDays(input.today, CYCLE_DAYS - 1),
    tasks,
    conflicts,
    warnings,
  };
}
