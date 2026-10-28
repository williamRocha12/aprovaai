import type { GoalSummary } from "@aprovaai/shared";

/** Cookie de preferência com o concurso em foco (não é credencial; a API valida o dono). */
export const GOAL_COOKIE = "aprovaai_goal";

/** Concurso em foco: o do cookie, se ainda estiver ativo; senão, o primeiro ativo da lista. */
export function pickSelectedGoal(goals: GoalSummary[], cookieValue: string | undefined): string | null {
  const active = goals.filter((g) => g.status === "ativo");
  if (cookieValue && active.some((g) => g.id === cookieValue)) return cookieValue;
  return active[0]?.id ?? null;
}
