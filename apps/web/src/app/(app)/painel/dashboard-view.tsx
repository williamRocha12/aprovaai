"use client";

import { ERROR_TYPE_LABELS, type Dashboard } from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccuracyLineChart, ChartTable, HorizontalBarChart } from "@/components/charts/charts";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatMinutes } from "@/lib/plan-ui";

function StatTile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

/** Medidor: trilho num tom claro da mesma cor; preenchimento verde = progresso. */
function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="mt-3 h-2 rounded-full bg-success-soft"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="h-2 rounded-full bg-success" style={{ width: `${pct}%` }} />
    </div>
  );
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function DashboardView() {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/api/dashboard"),
  });

  if (dashboard.isPending) return <LoadingState label="Calculando suas métricas..." />;
  if (dashboard.isError) return <Alert variant="error">{errorMessage(dashboard.error)}</Alert>;
  const d = dashboard.data;
  const weekly = d.weekly.map((w) => ({
    label: shortDate(w.weekStart),
    accuracy: w.accuracy,
    answered: w.answered,
  }));
  const subjects = d.bySubject.filter((s) => s.accuracy !== null);
  const errorTotal = d.errorDistribution.reduce((s, e) => s + e.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Painel</h1>
          <p className="text-sm text-muted-foreground">
            {d.examTitle ?? "Sem concurso-alvo"}
            {d.daysToExam !== null && ` · ${d.daysToExam} dias até a prova`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge>Valores calculados dos seus registros</Badge>
          {d.isSample && <Badge tone="warning">Plano sobre concurso de exemplo</Badge>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Horas líquidas (7 dias)"
          value={formatMinutes(d.week.netMinutes)}
          hint="Sessões registradas"
        />
        <StatTile
          label="Ciclo: realizado × planejado"
          value={`${formatMinutes(d.week.completedMinutes)} / ${formatMinutes(d.week.plannedMinutes)}`}
        >
          <Meter value={d.week.completedMinutes} max={d.week.plannedMinutes} label="Realizado do ciclo" />
        </StatTile>
        <StatTile
          label="Constância"
          value={`${d.streakDays} dia${d.streakDays === 1 ? "" : "s"} seguidos`}
          hint="Dias com estudo ou questões"
        />
        <StatTile
          label="Questões respondidas"
          value={String(d.questions.answered)}
          hint={
            d.questions.accuracy === null
              ? "Sem tentativas ainda"
              : `${d.questions.accuracy}% de acerto geral`
          }
        />
        <StatTile label="Cobertura do edital" value={`${d.coverage.covered} de ${d.coverage.total} assuntos`}>
          <Meter value={d.coverage.covered} max={d.coverage.total} label="Cobertura do edital" />
        </StatTile>
        <StatTile
          label="Revisões"
          value={`${d.reviews.today} hoje`}
          hint={d.reviews.overdue > 0 ? `${d.reviews.overdue} atrasada(s)` : "Nenhuma atrasada"}
        >
          {(d.reviews.today > 0 || d.reviews.overdue > 0) && (
            <Link
              href="/revisoes"
              className={buttonVariants({ size: "sm", variant: "outline", className: "mt-2" })}
            >
              Revisar
            </Link>
          )}
        </StatTile>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Acerto por semana (%)</h2>
          <p className="text-xs text-muted-foreground">
            Últimas 8 semanas; semanas sem questões ficam em branco.
          </p>
          {d.questions.answered === 0 ? (
            <EmptyState title="Ainda sem questões respondidas." />
          ) : (
            <>
              <AccuracyLineChart data={weekly} />
              <ChartTable
                caption="Acerto por semana"
                headers={["Semana", "Questões", "Acerto"]}
                rows={weekly.map((w) => [w.label, w.answered, w.accuracy === null ? "—" : `${w.accuracy}%`])}
              />
            </>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Acerto por disciplina (%)</h2>
          <p className="text-xs text-muted-foreground">Todas as tentativas registradas.</p>
          {subjects.length === 0 ? (
            <EmptyState title="Ainda sem questões respondidas." />
          ) : (
            <>
              <HorizontalBarChart
                max={100}
                unit="%"
                data={subjects.map((s) => ({
                  label: s.name,
                  value: s.accuracy ?? 0,
                  tip: `${s.accuracy}%`,
                  detail: `${s.correct} de ${s.answered} questões (${s.accuracy}%)`,
                }))}
              />
              <ChartTable
                caption="Acerto por disciplina"
                headers={["Disciplina", "Certas", "Respondidas", "Acerto"]}
                rows={subjects.map((s) => [s.name, s.correct, s.answered, `${s.accuracy}%`])}
              />
            </>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Por que você erra</h2>
          <p className="text-xs text-muted-foreground">Erros classificados após cada questão.</p>
          {errorTotal === 0 ? (
            <EmptyState
              title="Nenhum erro classificado ainda."
              description="Ao errar, informe o motivo: ele muda o tipo dos seus próximos blocos."
            />
          ) : (
            <>
              <HorizontalBarChart
                data={d.errorDistribution.map((e) => ({
                  label: ERROR_TYPE_LABELS[e.errorType],
                  value: e.count,
                  tip: String(e.count),
                  detail: `${e.count} erro(s) · ${Math.round((e.count / errorTotal) * 100)}% do total`,
                }))}
              />
              <ChartTable
                caption="Distribuição dos erros por tipo"
                headers={["Tipo de erro", "Quantidade", "% do total"]}
                rows={d.errorDistribution.map((e) => [
                  ERROR_TYPE_LABELS[e.errorType],
                  e.count,
                  `${Math.round((e.count / errorTotal) * 100)}%`,
                ])}
              />
            </>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Onde focar: piores assuntos com peso alto</h2>
          <p className="text-xs text-muted-foreground">
            Assuntos com 5+ questões e peso no edital acima da mediana.
          </p>
          {d.worstTopics.length === 0 ? (
            <EmptyState
              title="Amostra insuficiente."
              description="Responda ao menos 5 questões por assunto para aparecer aqui."
            />
          ) : (
            <table className="mt-3 w-full text-left text-sm">
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
                {d.worstTopics.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2">
                      {t.name}
                      <span className="block text-xs text-muted-foreground">{t.subjectName}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{t.answered}</td>
                    <td className="py-2 text-right tabular-nums">{t.accuracy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
