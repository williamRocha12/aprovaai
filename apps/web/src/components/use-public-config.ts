"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PublicConfig {
  googleLoginEnabled: boolean;
  mockExamsEnabled: boolean;
  aiEnabled: boolean;
  legalDocsVersion: string;
}

/** Configuração pública (flags efetivas). Recursos desligados simplesmente não aparecem. */
export function usePublicConfig() {
  return useQuery({
    queryKey: ["public-config"],
    queryFn: () => api.get<PublicConfig>("/api/public/config"),
    staleTime: 5 * 60_000,
  });
}
