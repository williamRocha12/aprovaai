"use client";

import type { Cycle, Task } from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectedGoalId } from "@/components/goal-context";
import { api } from "@/lib/api";

export interface PlanState {
  cycle: Cycle | null;
  issues: { code: string; message: string }[];
}

export const planKey = (goalId: string | null) => ["plan", goalId] as const;

/** Ciclo atual do concurso em foco. */
export function usePlan() {
  const goalId = useSelectedGoalId();
  return useQuery({
    queryKey: planKey(goalId),
    queryFn: () => api.get<PlanState>(`/api/goals/${goalId}/plan`),
    enabled: goalId !== null,
  });
}

/** Atualiza uma tarefa (status ou data) e recarrega o ciclo. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: Task["status"]; suggestedDate?: string }) =>
      api.patch<Task>(`/api/tasks/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan"] }),
  });
}

export function useRecalculate() {
  const goalId = useSelectedGoalId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PlanState>(`/api/goals/${goalId}/plan/recalculate`),
    onSuccess: (data) => queryClient.setQueryData(planKey(goalId), data),
  });
}
