"use client";

import { REPORT_STATUSES, type QuestionReport } from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_LABELS = { aberto: "Abertos", aceito: "Aceitos", rejeitado: "Rejeitados" } as const;

function ReportCard({ report }: { report: QuestionReport }) {
  const queryClient = useQueryClient();
  const [resolution, setResolution] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["reports"] });
  const resolve = useMutation({
    mutationFn: (status: "aceito" | "rejeitado") =>
      api.patch(`/api/moderation/reports/${report.id}`, { status, resolution }),
    onSuccess: refresh,
  });
  const annul = useMutation({
    mutationFn: () =>
      api.patch(`/api/moderation/questions/${report.questionId}`, { annulled: !report.annulled }),
    onSuccess: refresh,
  });
  const error = resolve.error ?? annul.error;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{formatDateTime(report.createdAt)}</span>
        {report.annulled && <Badge tone="danger">Questão anulada</Badge>}
        <span>Gabarito atual: {report.correctAnswer ?? "—"}</span>
        <Link href={`/questoes/${report.questionId}`} className="text-primary underline">
          Abrir questão
        </Link>
      </div>
      <p className="text-sm">{report.statementPreview}</p>
      <div className="rounded-md bg-muted p-3 text-sm">
        <p className="font-medium">Reporte</p>
        <p>{report.reason}</p>
      </div>
      {report.status === "aberto" ? (
        <>
          <label htmlFor={`res-${report.id}`} className="text-sm font-medium">
            Resolução
          </label>
          <textarea
            id={`res-${report.id}`}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-md border border-border bg-surface p-2 text-sm"
          />
          {error && <Alert variant="error">{errorMessage(error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => resolve.mutate("aceito")}
              disabled={resolution.trim().length < 3}
              loading={resolve.isPending}
            >
              Aceitar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => resolve.mutate("rejeitado")}
              disabled={resolution.trim().length < 3}
            >
              Rejeitar
            </Button>
            <Button size="sm" variant="danger" onClick={() => annul.mutate()} loading={annul.isPending}>
              {report.annulled ? "Desfazer anulação" : "Anular questão"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm">
          <strong>Resolução:</strong> {report.resolution}
        </p>
      )}
    </Card>
  );
}

export default function ModerationPage() {
  const [status, setStatus] = useState<(typeof REPORT_STATUSES)[number]>("aberto");
  const reports = useQuery({
    queryKey: ["reports", status],
    queryFn: () => api.get<QuestionReport[]>(`/api/moderation/reports?status=${status}`),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Moderação do catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Reportes de erro em questões do catálogo. Concursos em rascunho aparecem marcados em Concursos
          (edição na página de cada um).
        </p>
      </div>
      <div className="flex gap-2" role="tablist">
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              status === s ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {reports.isPending ? (
        <LoadingState />
      ) : reports.isError ? (
        <Alert variant="error">{errorMessage(reports.error)}</Alert>
      ) : reports.data.length === 0 ? (
        <EmptyState title="Nenhum reporte aqui." />
      ) : (
        <div className="space-y-3">
          {reports.data.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}
