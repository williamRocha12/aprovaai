import { z } from "zod";
import { weeklyAvailabilitySchema } from "./users";

export const TASK_TYPES = ["teoria", "questoes", "revisao", "lei_seca", "simulado", "analise_erros"] as const;
export const TASK_STATUSES = ["pendente", "em_andamento", "concluida", "pulada", "cancelada"] as const;
export const PHASES = ["base", "inicial", "intermediaria", "reta_final"] as const;

export const TASK_TYPE_LABELS: Record<(typeof TASK_TYPES)[number], string> = {
  teoria: "Teoria",
  questoes: "Questões",
  revisao: "Revisão",
  lei_seca: "Lei seca",
  simulado: "Simulado",
  analise_erros: "Análise de erros",
};

export const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  base: "Fase base (sem data de prova)",
  inicial: "Fase inicial (mais de 90 dias)",
  intermediaria: "Fase intermediária (30 a 90 dias)",
  reta_final: "Reta final (menos de 30 dias)",
};

const isoDate = z.iso.date();

export const priorityWeightsSchema = z.object({
  importance: z.number().min(0).max(1),
  difficulty: z.number().min(0).max(1),
  review: z.number().min(0).max(1),
  incidence: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1),
});

export const goalSubjectInputSchema = z.object({
  noticeSubjectId: z.uuid(),
  active: z.boolean(),
  selfAssessment: z.number().int().min(0).max(100).nullable(),
});

/** Onboarding e edição do plano. */
export const goalInputSchema = z.object({
  examId: z.uuid(),
  noticeId: z.uuid(),
  positionId: z.uuid().nullable().optional(),
  targetExamDate: isoDate.nullable().optional(),
  weeklyAvailability: weeklyAvailabilitySchema,
  blockMinutes: z.number().int().min(15).max(240),
  subjects: z.array(goalSubjectInputSchema).min(1),
  priorityWeights: priorityWeightsSchema.nullable().optional(),
  reviewIntervals: z.array(z.number().int().min(1).max(365)).min(1).max(6).optional(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

export const GOAL_STATUSES = ["ativo", "pausado", "encerrado"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
};
/** Mais concursos ativos que isso dilui o estudo; pausados e encerrados não contam. */
export const MAX_ACTIVE_GOALS = 3;

export const goalSchema = z.object({
  id: z.uuid(),
  status: z.enum(GOAL_STATUSES),
  examId: z.uuid(),
  examTitle: z.string(),
  noticeId: z.uuid(),
  positionId: z.uuid().nullable(),
  targetExamDate: z.string().nullable(),
  weeklyAvailability: weeklyAvailabilitySchema,
  blockMinutes: z.number().int(),
  priorityWeights: priorityWeightsSchema.nullable(),
  reviewIntervals: z.array(z.number().int()),
  subjects: z.array(
    z.object({
      noticeSubjectId: z.uuid(),
      name: z.string(),
      active: z.boolean(),
      selfAssessment: z.number().int().nullable(),
    }),
  ),
});
export type Goal = z.infer<typeof goalSchema>;

/** Cartão de "Meus concursos": números calculados dos registros do usuário naquele concurso. */
export const goalSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(GOAL_STATUSES),
  examId: z.uuid(),
  examTitle: z.string(),
  organization: z.string(),
  board: z.string().nullable(),
  uf: z.string().nullable(),
  isSample: z.boolean(),
  examDate: z.string().nullable(),
  daysToExam: z.number().int().nullable(),
  weeklyMinutes: z.number().int(),
  week: z.object({ plannedMinutes: z.number().int(), completedMinutes: z.number().int() }),
  coverage: z.object({ covered: z.number().int(), total: z.number().int() }),
  pendingToday: z.number().int(),
  createdAt: z.string(),
});
export type GoalSummary = z.infer<typeof goalSummarySchema>;

export const goalStatusInputSchema = z.object({ status: z.enum(GOAL_STATUSES) });

/** Endpoints que dependem de um concurso aceitam `goalId`; sem ele, usam o ativo mais recente. */
export const goalQuerySchema = z.object({ goalId: z.uuid().optional() });

export const planMessageSchema = z.object({
  code: z.string(),
  message: z.string(),
  ids: z.array(z.string()).optional(),
});

export const taskSchema = z.object({
  id: z.uuid(),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  suggestedDate: z.string(),
  orderIndex: z.number().int(),
  durationMin: z.number().int(),
  priority: z.number(),
  justification: z.string(),
  noticeTopicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
  subjectName: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const cycleSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  phase: z.enum(PHASES),
  startDate: z.string(),
  endDate: z.string(),
  daysToExam: z.number().int().nullable(),
  conflicts: z.array(planMessageSchema),
  warnings: z.array(planMessageSchema),
  tasks: z.array(taskSchema),
  weeklyAvailability: weeklyAvailabilitySchema,
});
export type Cycle = z.infer<typeof cycleSchema>;

export const updateTaskSchema = z
  .object({
    status: z.enum(["pendente", "em_andamento", "concluida", "pulada"]).optional(),
    suggestedDate: isoDate.optional(),
  })
  .refine((v) => v.status !== undefined || v.suggestedDate !== undefined, "Nada para atualizar.");

export const SESSION_SOURCES = ["manual", "cronometro", "pomodoro"] as const;

export const sessionInputSchema = z
  .object({
    taskId: z.uuid().nullable().optional(),
    noticeTopicId: z.uuid().nullable().optional(),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    netMinutes: z
      .number()
      .int()
      .min(1)
      .max(16 * 60),
    source: z.enum(SESSION_SOURCES).default("manual"),
    notes: z.string().trim().max(1000).optional(),
    /** Marca a tarefa vinculada como concluída. */
    completeTask: z.boolean().default(false),
  })
  .refine((v) => !v.endedAt || Date.parse(v.endedAt) >= Date.parse(v.startedAt), {
    message: "O fim deve ser depois do início.",
    path: ["endedAt"],
  });

export const sessionSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid().nullable(),
  noticeTopicId: z.uuid().nullable(),
  topicName: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  netMinutes: z.number().int(),
  source: z.enum(SESSION_SOURCES),
  notes: z.string().nullable(),
});
export type StudySession = z.infer<typeof sessionSchema>;

export const sessionsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
