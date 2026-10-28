"use client";

import type { GoalSummary } from "@aprovaai/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { GOAL_COOKIE } from "@/lib/goal-cookie";

interface GoalContextValue {
  goals: GoalSummary[];
  /** Concurso em foco nas telas Agora, Plano, Painel e Questões (null sem nenhum ativo). */
  selectedGoalId: string | null;
  selectGoal: (goalId: string) => void;
}

const GoalContext = createContext<GoalContextValue>({
  goals: [],
  selectedGoalId: null,
  selectGoal: () => undefined,
});

/**
 * O concurso em foco é só uma preferência de navegação (cookie não sensível). Quem garante que o
 * concurso é do usuário é a API: um goalId de outra pessoa responde 404.
 */
export function GoalProvider({
  goals,
  selectedGoalId,
  children,
}: {
  goals: GoalSummary[];
  selectedGoalId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const selectGoal = useCallback(
    (goalId: string) => {
      document.cookie = `${GOAL_COOKIE}=${goalId}; path=/; max-age=31536000; samesite=lax`;
      void queryClient.invalidateQueries();
      router.refresh();
    },
    [queryClient, router],
  );
  return <GoalContext value={{ goals, selectedGoalId, selectGoal }}>{children}</GoalContext>;
}

export function useGoals() {
  return useContext(GoalContext);
}

/** goalId do concurso em foco; as telas que dependem de plano só renderizam com ele definido. */
export function useSelectedGoalId(): string | null {
  return useContext(GoalContext).selectedGoalId;
}

/** Sufixo de query para endpoints que aceitam goalId opcional. */
export function goalQuery(goalId: string | null, prefix: "?" | "&" = "?"): string {
  return goalId ? `${prefix}goalId=${goalId}` : "";
}
