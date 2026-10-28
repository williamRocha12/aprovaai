"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGoals } from "@/components/goal-context";

/** Telas em que o concurso em foco muda o conteúdo. */
const GOAL_SCOPED = ["/agora", "/plano", "/painel", "/questoes", "/simulados", "/caderno-de-erros"];

/** Barra "Estudando: X" para alternar o concurso em foco quando há mais de um ativo. */
export function GoalSwitcher() {
  const { goals, selectedGoalId, selectGoal } = useGoals();
  const pathname = usePathname();
  const active = goals.filter((g) => g.status === "ativo");
  if (active.length === 0 || !GOAL_SCOPED.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="border-b border-border bg-muted/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <label htmlFor="goal-switcher" className="text-muted-foreground">
          Estudando:
        </label>
        {active.length === 1 ? (
          <span className="font-medium">{active[0]?.examTitle}</span>
        ) : (
          <select
            id="goal-switcher"
            value={selectedGoalId ?? ""}
            onChange={(e) => selectGoal(e.target.value)}
            className="h-8 max-w-full rounded-md border border-border bg-surface px-2 text-sm font-medium"
          >
            {active.map((g) => (
              <option key={g.id} value={g.id}>
                {g.examTitle}
              </option>
            ))}
          </select>
        )}
        <Link href="/meus-concursos" className="ml-auto text-primary hover:underline">
          Meus concursos
        </Link>
      </div>
    </div>
  );
}
