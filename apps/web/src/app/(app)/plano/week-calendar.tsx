"use client";

import { TASK_TYPE_LABELS, type Task, type WeeklyAvailability } from "@aprovaai/shared";
import Link from "next/link";
import { useState, type DragEvent } from "react";
import { usePlan, useRecalculate, useUpdateTask } from "@/components/plan/use-plan";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, LoadingState } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import {
  TASK_TYPE_STYLES,
  WEEKDAY_SHORT,
  addDays,
  formatMinutes,
  localToday,
  weekdayOf,
} from "@/lib/plan-ui";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Partial<Record<Task["status"], string>> = { concluida: "Concluída", pulada: "Pulada" };

function TaskCard({
  task,
  onAction,
  draggable,
}: {
  task: Task;
  onAction: (task: Task, status: Task["status"]) => void;
  draggable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const done = task.status === "concluida";
  const skipped = task.status === "pulada";
  return (
    <li
      draggable={draggable}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "rounded-md border border-border bg-surface p-2 text-xs shadow-sm",
        draggable && "cursor-grab active:cursor-grabbing",
        done && "border-success/40 bg-success-soft/40",
        skipped && "opacity-60",
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={cn("inline-flex rounded px-1.5 py-0.5 font-medium", TASK_TYPE_STYLES[task.type])}>
          {TASK_TYPE_LABELS[task.type]}
        </span>{" "}
        <span className="text-muted-foreground">{formatMinutes(task.durationMin)}</span>
        <span className={cn("mt-1 block font-medium", skipped && "line-through")}>
          {task.topicName ?? "Simulado"}
        </span>
        <span className="block text-muted-foreground">{task.subjectName}</span>
        {STATUS_LABEL[task.status] && (
          <span className="mt-1 block font-medium">{STATUS_LABEL[task.status]}</span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <p>{task.justification}</p>
          <div className="flex flex-wrap gap-1">
            {task.status !== "concluida" && (
              <Button size="sm" onClick={() => onAction(task, "concluida")}>
                Concluir
              </Button>
            )}
            {task.status === "pendente" && (
              <Button size="sm" variant="ghost" onClick={() => onAction(task, "pulada")}>
                Pular
              </Button>
            )}
            {(done || skipped) && (
              <Button size="sm" variant="outline" onClick={() => onAction(task, "pendente")}>
                Reabrir
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export function WeekCalendar() {
  const plan = usePlan();
  const updateTask = useUpdateTask();
  const recalculate = useRecalculate();
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  if (plan.isPending) return <LoadingState label="Carregando a semana..." />;
  if (plan.isError) return <Alert variant="error">{errorMessage(plan.error)}</Alert>;
  const cycle = plan.data.cycle;
  if (!cycle) {
    return (
      <Alert variant="warning" title="Sem ciclo ativo">
        {plan.data.issues.map((i) => i.message).join(" ")}{" "}
        <Link href="/onboarding" className="underline">
          Ajustar plano
        </Link>
      </Alert>
    );
  }

  const today = localToday();
  const days = Array.from({ length: 7 }, (_, i) => addDays(cycle.startDate, i));

  async function act(task: Task, status: Task["status"]) {
    setError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, status });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function drop(date: string, e: DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const task = cycle?.tasks.find((t) => t.id === id);
    if (!task || task.suggestedDate === date) return;
    setError(null);
    try {
      await updateTask.mutateAsync({ id, suggestedDate: date });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plano da semana</h1>
          <p className="text-sm text-muted-foreground">
            Arraste um bloco para outro dia para reagendar. Clique para ver o porquê e as ações.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Ajustar plano
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalculate.mutate()}
            loading={recalculate.isPending}
          >
            Recalcular ciclo
          </Button>
        </div>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {cycle.conflicts.map((c) => (
        <Alert key={c.code} variant="warning">
          {c.message}
        </Alert>
      ))}
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((date) => {
          const tasks = cycle.tasks.filter((t) => t.suggestedDate === date);
          const limit = cycle.weeklyAvailability[String(weekdayOf(date)) as keyof WeeklyAvailability] ?? 0;
          const used = tasks.filter((t) => t.status !== "pulada").reduce((s, t) => s + t.durationMin, 0);
          const canDrop = date >= today;
          return (
            <div
              key={date}
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                setDragOver(date);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => drop(date, e)}
              className={cn(
                "min-h-32 rounded-lg border border-border bg-muted/40 p-2",
                date === today && "border-primary",
                dragOver === date && "ring-2 ring-primary",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className={cn("font-semibold", date === today && "text-primary")}>
                  {WEEKDAY_SHORT[weekdayOf(date)]} {date.slice(8, 10)}/{date.slice(5, 7)}
                </span>
                <span className={cn("text-muted-foreground", used > limit && "text-danger")}>
                  {formatMinutes(used)}/{formatMinutes(limit)}
                </span>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{limit === 0 ? "Sem estudo" : "Livre"}</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} onAction={act} draggable={t.status === "pendente"} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
