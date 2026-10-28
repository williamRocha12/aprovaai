"use client";

import { GOAL_STATUS_LABELS, MAX_ACTIVE_GOALS, type GoalStatus, type GoalSummary } from "@aprovaai/shared";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGoals } from "@/components/goal-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatDateBr, formatMinutes } from "@/lib/plan-ui";

const STATUS_TONE: Record<GoalStatus, "success" | "warning" | "neutral"> = {
  ativo: "success",
  pausado: "warning",
  encerrado: "neutral",
};

/** Barra de progresso: trilho claro e preenchimento verde = realizado. */
function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="mt-1 h-2 rounded-full bg-success-soft"
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

function GoalCard({ goal, canActivate }: { goal: GoalSummary; canActivate: boolean }) {
  const router = useRouter();
  const { selectGoal } = useGoals();
  const setStatus = useMutation({
    mutationFn: (status: GoalStatus) => api.patch<GoalSummary>(`/api/goals/${goal.id}/status`, { status }),
    onSuccess: () => router.refresh(),
  });

  function study(path: string) {
    selectGoal(goal.id);
    router.push(path);
  }

  const { week, coverage } = goal;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{goal.examTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {goal.organization}
            {goal.board ? ` · ${goal.board}` : ""}
            {goal.uf ? ` · ${goal.uf}` : " · Nacional"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge tone={STATUS_TONE[goal.status]}>{GOAL_STATUS_LABELS[goal.status]}</Badge>
          {goal.isSample && <Badge tone="warning">Exemplo</Badge>}
        </div>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Prova</dt>
          <dd className="font-medium">
            {goal.examDate
              ? `${formatDateBr(goal.examDate)} (${goal.daysToExam} dias)`
              : "Data não confirmada"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ciclo da semana</dt>
          <dd className="font-medium tabular-nums">
            {goal.status === "ativo"
              ? `${formatMinutes(week.completedMinutes)} de ${formatMinutes(week.plannedMinutes)}`
              : "Sem ciclo (pausado)"}
          </dd>
          {goal.status === "ativo" && (
            <Progress value={week.completedMinutes} max={week.plannedMinutes} label="Realizado do ciclo" />
          )}
        </div>
        <div>
          <dt className="text-muted-foreground">Cobertura do edital</dt>
          <dd className="font-medium tabular-nums">
            {coverage.covered} de {coverage.total} assuntos
          </dd>
          <Progress value={coverage.covered} max={coverage.total} label="Cobertura do edital" />
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        {formatMinutes(goal.weeklyMinutes)} por semana neste concurso
        {goal.status === "ativo" && goal.pendingToday > 0 && ` · ${goal.pendingToday} tarefa(s) para hoje`}
      </p>

      {setStatus.isError && <Alert variant="error">{errorMessage(setStatus.error)}</Alert>}

      <div className="flex flex-wrap gap-2">
        {goal.status === "ativo" && (
          <>
            <Button size="sm" onClick={() => study("/agora")}>
              Estudar agora
            </Button>
            <Button size="sm" variant="outline" onClick={() => study("/plano")}>
              Plano da semana
            </Button>
            <Button size="sm" variant="outline" onClick={() => study("/painel")}>
              Painel
            </Button>
          </>
        )}
        {goal.status !== "encerrado" && (
          <Link
            href={`/onboarding?editar=${goal.id}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Editar plano
          </Link>
        )}
        {goal.status === "ativo" && (
          <Button
            size="sm"
            variant="ghost"
            loading={setStatus.isPending}
            onClick={() => setStatus.mutate("pausado")}
          >
            Pausar
          </Button>
        )}
        {goal.status !== "ativo" && (
          <Button
            size="sm"
            variant="outline"
            disabled={!canActivate}
            title={canActivate ? undefined : `Limite de ${MAX_ACTIVE_GOALS} concursos ativos`}
            loading={setStatus.isPending}
            onClick={() => setStatus.mutate("ativo")}
          >
            {goal.status === "pausado" ? "Retomar" : "Reabrir"}
          </Button>
        )}
        {goal.status !== "encerrado" && (
          <Button
            size="sm"
            variant="ghost"
            loading={setStatus.isPending}
            onClick={() => {
              if (window.confirm("Encerrar este concurso? O histórico de estudo continua guardado.")) {
                setStatus.mutate("encerrado");
              }
            }}
          >
            Encerrar
          </Button>
        )}
      </div>
    </Card>
  );
}

export function MyGoalsView() {
  const { goals } = useGoals();
  const active = goals.filter((g) => g.status === "ativo");
  const canAdd = active.length < MAX_ACTIVE_GOALS;
  const weeklyTotal = active.reduce((sum, g) => sum + g.weeklyMinutes, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Meus concursos</h1>
          <p className="text-sm text-muted-foreground">
            Cada concurso tem o próprio plano, ciclo e painel. Questões, revisões e caderno de erros valem
            para todos.
          </p>
        </div>
        {canAdd ? (
          <Link href="/onboarding" className={buttonVariants()}>
            Adicionar concurso
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">
            Limite de {MAX_ACTIVE_GOALS} concursos ativos. Pause um para adicionar outro.
          </span>
        )}
      </div>

      {active.length > 1 && (
        <Alert variant="info">
          Seus concursos ativos somam {formatMinutes(weeklyTotal)} de estudo por semana. Confira se esse total
          cabe na sua rotina; se não couber, reduza as horas em Editar plano.
        </Alert>
      )}

      {goals.length === 0 ? (
        <EmptyState
          title="Você ainda não estuda nenhum concurso."
          description="Adicione um concurso para montar o plano de estudos."
        />
      ) : (
        <div className="space-y-4">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} canActivate={canAdd} />
          ))}
        </div>
      )}
    </div>
  );
}
