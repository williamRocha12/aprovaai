export const TASK_TYPES = ["teoria", "questoes", "revisao", "lei_seca", "simulado", "analise_erros"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const ERROR_TYPES = [
  "falta_de_teoria",
  "pegadinha_da_banca",
  "falta_de_atencao",
  "interpretacao",
  "chute",
  "esquecimento",
] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

export const PHASES = ["base", "inicial", "intermediaria", "reta_final"] as const;
export type Phase = (typeof PHASES)[number];

/** Minutos por dia da semana ("0" = domingo). */
export type WeeklyAvailability = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", number>;

export interface PriorityWeights {
  importance: number;
  difficulty: number;
  review: number;
  incidence: number;
  coverage: number;
}
