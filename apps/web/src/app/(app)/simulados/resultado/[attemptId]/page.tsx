"use client";

import type { MockExamResult } from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChartTable, HorizontalBarChart } from "@/components/charts/charts";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";

export default function MockExamResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const result = useQuery({
    queryKey: ["mock-result", attemptId],
    queryFn: () => api.get<MockExamResult>(`/api/mock-exam-attempts/${attemptId}/result`),
  });

  if (result.isPending) return <LoadingState label="Corrigindo..." />;
  if (result.isError) return <Alert variant="error">{errorMessage(result.error)}</Alert>;
  const r = result.data;
  const subjects = r.bySubject.filter((s) => s.accuracy !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{r.title}</h1>
          <p className="text-sm text-muted-foreground">
            {r.scoringType === "wrong_cancels_right"
              ? `Regra: cada errada anula ${r.wrongPenalty} certa`
              : "Regra: sem penalidade por erro"}
          </p>
        </div>
        <Link href="/simulados" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar aos simulados
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">Nota</p>
          <p className="text-5xl font-semibold tabular-nums">
            {r.score}
            <span className="text-xl font-normal text-muted-foreground"> / {r.maxScore}</span>
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Acertos / erros / brancos</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {r.correct} / {r.wrong} / {r.blank}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Acerto nas respondidas</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {r.accuracy === null ? "—" : `${r.accuracy}%`}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Tempo médio por questão</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {r.averageTimeSec === null ? "—" : `${Math.round(r.averageTimeSec / 60)} min`}
          </p>
          {r.timeExceeded && <p className="text-xs text-danger">Passou do tempo-limite</p>}
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold">Recomendações para o próximo ciclo</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {r.recommendations.map((rec) => (
            <li key={rec}>{rec}</li>
          ))}
        </ul>
        {r.wrongQuestionIds.length > 0 && (
          <Link href="/caderno-de-erros" className={buttonVariants({ size: "sm", className: "mt-3" })}>
            Ver erros no caderno
          </Link>
        )}
      </Card>

      {subjects.length > 0 && (
        <Card>
          <h2 className="font-semibold">Acerto por disciplina (%)</h2>
          <HorizontalBarChart
            max={100}
            unit="%"
            data={subjects.map((s) => ({
              label: s.name,
              value: s.accuracy ?? 0,
              tip: `${s.accuracy}%`,
              detail: `${s.correct} certas, ${s.wrong} erradas, ${s.blank} em branco`,
            }))}
          />
          <ChartTable
            caption="Resultado por disciplina"
            headers={["Disciplina", "Certas", "Erradas", "Brancos", "Acerto"]}
            rows={r.bySubject.map((s) => [
              s.name,
              s.correct,
              s.wrong,
              s.blank,
              s.accuracy === null ? "—" : `${s.accuracy}%`,
            ])}
          />
        </Card>
      )}

      {r.byTopic.length > 0 && (
        <Card>
          <h2 className="font-semibold">Por assunto</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 font-medium">
                  Assunto
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Questões
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Acerto
                </th>
              </tr>
            </thead>
            <tbody>
              {r.byTopic.map((t) => (
                <tr key={t.topicId} className="border-t border-border">
                  <td className="py-1.5">{t.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.total}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {t.accuracy === null ? "—" : `${t.accuracy}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
