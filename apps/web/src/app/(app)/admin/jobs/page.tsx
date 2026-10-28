"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";

interface JobsOverview {
  counts: Record<string, number>;
  recent: {
    id: string;
    type: string;
    status: string;
    attempts: number;
    lastError: string | null;
    runAfter: string;
    updatedAt: string;
  }[];
}

interface RunSummary {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  pendente: "warning",
  executando: "neutral",
  concluido: "success",
  falhou: "danger",
};

const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR");

export default function AdminJobsPage() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () => api.get<JobsOverview>("/api/admin/jobs"),
  });
  const run = useMutation({
    mutationFn: () => api.post<RunSummary>("/api/admin/jobs/run"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-jobs"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fila de tarefas</h1>
          <p className="text-sm text-muted-foreground">
            Processamento de provas, manutenção diária e coletas. O cron da Vercel roda a fila uma vez por
            dia.
          </p>
        </div>
        <Button onClick={() => run.mutate()} loading={run.isPending}>
          Rodar agora
        </Button>
      </div>

      {run.isError && <Alert variant="error">{errorMessage(run.error)}</Alert>}
      {run.data && (
        <Alert variant="success">
          {run.data.processed} processada(s): {run.data.succeeded} ok, {run.data.retried} para nova tentativa,{" "}
          {run.data.failed} com falha.
        </Alert>
      )}

      {overview.isPending ? (
        <LoadingState />
      ) : overview.isError ? (
        <Alert variant="error">{errorMessage(overview.error)}</Alert>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(overview.data.counts).map(([status, count]) => (
              <Badge key={status} tone={STATUS_TONE[status] ?? "neutral"}>
                {status}: {count}
              </Badge>
            ))}
          </div>
          <Card className="overflow-x-auto p-0">
            {overview.data.recent.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Nenhuma tarefa registrada." />
              </div>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Últimas 50 tarefas</caption>
                <thead className="border-b border-border text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Tentativas</th>
                    <th className="p-3 font-medium">Próxima execução</th>
                    <th className="p-3 font-medium">Atualizada</th>
                    <th className="p-3 font-medium">Último erro</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.data.recent.map((j) => (
                    <tr key={j.id} className="border-b border-border last:border-0">
                      <td className="p-3 font-mono text-xs">{j.type}</td>
                      <td className="p-3">
                        <Badge tone={STATUS_TONE[j.status] ?? "neutral"}>{j.status}</Badge>
                      </td>
                      <td className="p-3 tabular-nums">{j.attempts}</td>
                      <td className="p-3">{dateTime(j.runAfter)}</td>
                      <td className="p-3">{dateTime(j.updatedAt)}</td>
                      <td className="max-w-xs truncate p-3 text-danger" title={j.lastError ?? undefined}>
                        {j.lastError ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
