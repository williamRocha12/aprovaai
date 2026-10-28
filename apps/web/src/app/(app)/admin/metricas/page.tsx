"use client";

import type { AdminMetrics } from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import { Alert, Card, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatMinutes } from "@/lib/plan-ui";

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function AdminMetricsPage() {
  const metrics = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () => api.get<AdminMetrics>("/api/admin/metrics"),
  });
  if (metrics.isPending) return <LoadingState label="Calculando métricas..." />;
  if (metrics.isError) return <Alert variant="error">{errorMessage(metrics.error)}</Alert>;
  const m = metrics.data;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Métricas de uso</h1>
        <p className="text-sm text-muted-foreground">
          Números agregados e anônimos: nenhuma métrica identifica um usuário.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Usuários"
          value={m.users.total}
          hint={`${m.users.verified} verificados · ${m.users.disabled} desativados`}
        />
        <Tile label="Com plano configurado" value={m.users.withGoal} />
        <Tile
          label="Ativos em 7 dias"
          value={m.activeUsers.last7Days}
          hint={`${m.activeUsers.last30Days} em 30 dias`}
        />
        <Tile
          label="Questões respondidas"
          value={m.questionsAnswered.last7Days}
          hint={`7 dias · ${m.questionsAnswered.total} no total`}
        />
        <Tile
          label="Horas de estudo (7 dias)"
          value={formatMinutes(m.studyMinutes.last7Days)}
          hint={`${formatMinutes(m.studyMinutes.last30Days)} em 30 dias`}
        />
        <Tile
          label="Concursos no catálogo"
          value={m.catalog.exams}
          hint={`${m.catalog.drafts} em rascunho/revisão`}
        />
        <Tile label="Questões no catálogo" value={m.catalog.questions} />
        <Tile label="Reportes abertos" value={m.catalog.openReports} />
      </div>
    </div>
  );
}
