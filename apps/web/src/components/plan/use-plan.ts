"use client";

import type { Cycle, Task } from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PlanState {
  cycle: Cycle | null;
  issues: { code: string; message: string }[];
}

export const PLAN_KEY = ["plan", "current"] as const;

export function usePlan() {
  return useQuery({ queryKey: PLAN_KEY, queryFn: () => api.get<PlanState>("/api/plan/current") });
}

/** Atualiza uma tarefa (status ou data) e recarrega o ciclo. */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: Task["status"]; suggestedDate?: string }) =>
      api.patch<Task>(`/api/tasks/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLAN_KEY }),
  });
}

export function useRecalculate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PlanState>("/api/plan/recalculate"),
    onSuccess: (data) => queryClient.setQueryData(PLAN_KEY, data),
  });
}
