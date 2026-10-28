"use client";

import { useQuery } from "@tanstack/react-query";
import { goalQuery, useSelectedGoalId } from "@/components/goal-context";
import { api, ApiRequestError } from "@/lib/api";

export interface GoalTopic {
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  noticeTopicId: string;
}

/** Disciplinas e assuntos do concurso em foco (para filtros e cadastro). Lista vazia sem plano. */
export function useGoalTopics() {
  const goalId = useSelectedGoalId();
  return useQuery({
    queryKey: ["goal-topics", goalId],
    queryFn: async () => {
      try {
        return await api.get<GoalTopic[]>(`/api/goal/topics${goalQuery(goalId)}`);
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) return [];
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function subjectsOf(topics: GoalTopic[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const t of topics) map.set(t.subjectId, t.subjectName);
  return [...map].map(([id, name]) => ({ id, name }));
}
