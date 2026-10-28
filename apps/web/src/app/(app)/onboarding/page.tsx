import type { Goal, MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import { serverGet } from "@/lib/server-api";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Configurar plano" };

/** Sem `editar`: adiciona um concurso. Com `editar=<goalId>`: edita o plano daquele concurso. */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ concurso?: string; editar?: string }>;
}) {
  const { concurso, editar } = await searchParams;
  const [goal, me] = await Promise.all([
    editar ? serverGet<Goal>(`/api/goals/${encodeURIComponent(editar)}`) : Promise.resolve({ data: null }),
    serverGet<MeResponse>("/api/me"),
  ]);
  const existing = goal.data && goal.data.status !== "encerrado" ? goal.data : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {existing ? `Editar plano — ${existing.examTitle}` : "Adicionar concurso"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {existing
            ? "Horas disponíveis, disciplinas e data da prova deste concurso. O ciclo é recalculado ao salvar."
            : "Escolha o estado e clique no concurso; depois configure horas, disciplinas e data da prova."}
        </p>
      </div>
      <OnboardingWizard
        existing={existing}
        preselectedExamId={existing ? null : (concurso ?? null)}
        defaultAvailability={me.data?.profile.weeklyAvailability ?? null}
      />
    </div>
  );
}
