"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface SessionItem {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Resumo legível do user-agent, sem biblioteca extra. */
function describeAgent(ua?: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navegador";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} · ${os}` : browser;
}

export function SessionsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<SessionItem[]>("/api/auth/list-sessions"),
  });
  const current = useQuery({
    queryKey: ["current-session"],
    queryFn: () => api.get<{ session: { token: string } } | null>("/api/auth/get-session"),
  });

  const revoke = useMutation({
    mutationFn: (token: string) => api.post("/api/auth/revoke-session", { token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  const revokeAll = useMutation({
    mutationFn: () => api.post("/api/auth/revoke-sessions"),
    onSuccess: () => {
      router.replace("/entrar");
      router.refresh();
    },
  });

  if (sessions.isPending) return <LoadingState label="Carregando sessões..." />;
  if (sessions.isError) return <Alert variant="error">{errorMessage(sessions.error)}</Alert>;
  if (sessions.data.length === 0) return <EmptyState title="Nenhuma sessão ativa." />;

  const currentToken = current.data?.session.token;
  const mutationError = revoke.error ?? revokeAll.error;

  return (
    <div className="space-y-4">
      {mutationError && <Alert variant="error">{errorMessage(mutationError)}</Alert>}
      <ul className="divide-y divide-border rounded-md border border-border">
        {sessions.data.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">
                {describeAgent(s.userAgent)}{" "}
                {s.token === currentToken && <Badge tone="success">Esta sessão</Badge>}
              </p>
              <p className="text-muted-foreground">
                Desde {formatDateTime(s.createdAt)}
                {s.ipAddress ? ` · IP ${s.ipAddress}` : ""}
              </p>
            </div>
            {s.token !== currentToken && (
              <Button
                variant="outline"
                size="sm"
                loading={revoke.isPending && revoke.variables === s.token}
                onClick={() => revoke.mutate(s.token)}
              >
                Encerrar
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="danger" loading={revokeAll.isPending} onClick={() => revokeAll.mutate()}>
        Sair de todos os dispositivos
      </Button>
    </div>
  );
}
