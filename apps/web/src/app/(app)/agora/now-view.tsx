"use client";

import { PHASE_LABELS, TASK_TYPE_LABELS, type Task } from "@aprovaai/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { TimerDisplay, useTaskTimer } from "@/components/plan/task-timer";
import { PLAN_KEY, usePlan, useRecalculate, useUpdateTask } from "@/components/plan/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { TASK_TYPE_STYLES, formatDayShort, formatMinutes, isOpen, localToday } from "@/lib/plan-ui";
import { cn } from "@/lib/utils";

function TypeBadge({ type }: { type: Task["type"] }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TASK_TYPE_STYLES[type])}>
      {TASK_TYPE_LABELS[type]}
    </span>
  );
}

export function NowView() {
  const plan = usePlan();
  const updateTask = useUpdateTask();
  const recalculate = useRecalculate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const cycle = plan.data?.cycle ?? null;
  const open = cycle?.tasks.filter(isOpen) ?? [];
  const next = open[0] ?? null;
  const timer = useTaskTimer(next?.id ?? null);

  if (plan.isPending) return <LoadingState label="Montando seu próximo bloco..." />;
  if (plan.isError) return <Alert variant="error">{errorMessage(plan.error)}</Alert>;

  const today = localToday();
  const todayTasks = cycle?.tasks.filter((t) => t.suggestedDate === today && t.status !== "pulada") ?? [];
  const doneToday = todayTasks.filter((t) => t.status === "concluida").reduce((s, t) => s + t.durationMin, 0);
  const plannedToday = todayTasks.reduce((s, t) => s + t.durationMin, 0);

  async function finish(task: Task) {
    setFinishing(true);
    setError(null);
    try {
      const ms = timer.currentElapsedMs();
      if (timer.state && ms >= 60_000) {
        // Registra a sessão cronometrada e conclui a tarefa.
        await api.post("/api/sessions", {
          taskId: task.id,
          startedAt: new Date(timer.state.firstStartedAt).toISOString(),
          endedAt: new Date().toISOString(),
          netMinutes: Math.max(1, Math.round(ms / 60_000)),
          source: "cronometro",
          completeTask: true,
        });
        await queryClient.invalidateQueries({ queryKey: PLAN_KEY });
      } else {
        await updateTask.mutateAsync({ id: task.id, status: "concluida" });
      }
      timer.reset();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFinishing(false);
    }
  }

  async function skip(task: Task) {
    setError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, status: "pulada" });
      timer.reset();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">O que estudar agora</h1>
          {cycle && (
            <p className="text-sm text-muted-foreground">
              {PHASE_LABELS[cycle.phase]}
              {cycle.daysToExam !== null && ` · ${cycle.daysToExam} dias até a prova`} · ciclo {cycle.number}{" "}
              ({formatDayShort(cycle.startDate)} a {formatDayShort(cycle.endDate)})
            </p>
          )}
        </div>
        <Link href="/plano" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Ver semana
        </Link>
      </div>

      {plan.data.issues.map((issue) => (
        <Alert key={issue.code} variant="warning" title="Não foi possível montar o ciclo">
          {issue.message}{" "}
          <Link href="/onboarding" className="underline">
            Ajustar plano
          </Link>
        </Alert>
      ))}
      {cycle?.warnings.map((w) => (
        <Alert key={w.code} variant="info">
          {w.message}
        </Alert>
      ))}
      {cycle?.conflicts.map((c) => (
        <Alert key={c.code} variant="warning" title="Conflito no ciclo">
          {c.message}
        </Alert>
      ))}
      {error && <Alert variant="error">{error}</Alert>}

      {next ? (
        <Card className="space-y-4 border-primary/40">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <TypeBadge type={next.type} />
            <span>{formatMinutes(next.durationMin)}</span>
            <span>
              · sugerido para {next.suggestedDate === today ? "hoje" : formatDayShort(next.suggestedDate)}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{next.subjectName ?? "Simulado"}</p>
            <h2 className="text-xl font-semibold">{next.topicName ?? "Simulado no formato da banca"}</h2>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">Por quê?</p>
            <p>{next.justification}</p>
          </div>
          <TimerDisplay timer={timer} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => finish(next)} loading={finishing}>
              Concluir bloco
            </Button>
            <Button variant="ghost" onClick={() => skip(next)} disabled={updateTask.isPending}>
              Pular
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Com o cronômetro, o tempo líquido vira uma sessão de estudo. Pular não gera atraso: a fila só
            anda.
          </p>
        </Card>
      ) : cycle ? (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Ciclo concluído</h2>
          <p className="text-sm text-muted-foreground">
            Você fechou todos os blocos deste ciclo. O próximo começa automaticamente em{" "}
            {formatDayShort(cycle.endDate)}, ou gere agora com base no seu desempenho atual.
          </p>
          <Button onClick={() => recalculate.mutate()} loading={recalculate.isPending}>
            Gerar próximo ciclo
          </Button>
        </Card>
      ) : null}

      {cycle && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="font-semibold">Hoje</h2>
            <p className="mt-2 text-3xl font-semibold">
              {formatMinutes(doneToday)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                de {formatMinutes(plannedToday)}
              </span>
            </p>
            <div
              className="mt-3 h-2 rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={doneToday}
              aria-valuemin={0}
              aria-valuemax={plannedToday}
              aria-label="Progresso de hoje"
            >
              <div
                className="h-2 rounded-full bg-success"
                style={{ width: `${plannedToday ? Math.min(100, (doneToday / plannedToday) * 100) : 0}%` }}
              />
            </div>
          </Card>
          <Card>
            <h2 className="font-semibold">Próximos blocos</h2>
            {open.length <= 1 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum outro bloco pendente neste ciclo.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {open.slice(1, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <TypeBadge type={t.type} /> {t.topicName ?? "Simulado"}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatMinutes(t.durationMin)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
