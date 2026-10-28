"use client";

import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/feedback";
import { usePublicConfig } from "@/components/use-public-config";
import { api, errorMessage } from "@/lib/api";

interface PlanSummary {
  summary: string;
  highlights: string[];
  sources: {
    boardName: string | null;
    boardSample: { exams: number; yearFrom: number | null; yearTo: number | null };
  };
}

/** Resumo estratégico sob demanda: só aparece com IA ligada; nada é gerado sem o clique (consome cota). */
export function PlanSummaryCard() {
  const config = usePublicConfig();
  const summary = useMutation({ mutationFn: () => api.post<PlanSummary>("/api/ai/plan-summary") });
  if (!config.data?.aiEnabled) return null;

  const sample = summary.data?.sources.boardSample;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Resumo estratégico</h2>
          <Badge tone="warning">Gerado por IA</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => summary.mutate()} loading={summary.isPending}>
          {summary.data ? "Gerar de novo" : "Gerar resumo"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A IA lê só os números do seu plano e o Raio-X da banca (sem nome nem e-mail). Não é previsão de
        aprovação.
      </p>
      {summary.isError && <Alert variant="error">{errorMessage(summary.error)}</Alert>}
      {summary.data && (
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-line">{summary.data.summary}</p>
          {summary.data.highlights.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {summary.data.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {summary.data.sources.boardName && sample && sample.exams > 0
              ? `Base da banca: ${summary.data.sources.boardName}, ${sample.exams} prova(s) analisada(s)${
                  sample.yearFrom ? ` (${sample.yearFrom}–${sample.yearTo})` : ""
                }.`
              : "Sem provas analisadas da banca: o resumo usa só o seu desempenho e o edital."}
          </p>
        </div>
      )}
    </Card>
  );
}
