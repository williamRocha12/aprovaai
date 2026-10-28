"use client";

import { useQuery } from "@tanstack/react-query";
import { api, ApiRequestError } from "@/lib/api";

export interface GoalTopic {
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  noticeTopicId: string;
}

/** Disciplinas e assuntos do plano do usuário (para filtros e cadastro). Lista vazia sem plano. */
export function useGoalTopics() {
  return useQuery({
    queryKey: ["goal-topics"],
    queryFn: async () => {
      try {
        return await api.get<GoalTopic[]>("/api/goal/topics");
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
