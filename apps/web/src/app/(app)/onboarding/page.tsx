import type { Goal, MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import { serverGet } from "@/lib/server-api";
import { ExamPicker } from "./exam-picker";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Configurar plano" };

/**
 * Fluxo em duas telas:
 * 1. sem parâmetros: lista de concursos (filtro por estado);
 * 2. `concurso=<examId>`: configuração do plano do concurso escolhido.
 * `editar=<goalId>` abre a configuração de um plano existente.
 */
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
  const examId = existing?.examId ?? concurso ?? null;

  if (!examId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Escolha o concurso</h1>
          <p className="text-sm text-muted-foreground">
            Filtre pelo seu estado e clique no concurso que vai prestar. Depois você configura horas,
            disciplinas e data da prova.
          </p>
        </div>
        <ExamPicker />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {existing ? "Editar plano de estudos" : "Configurar plano"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Três passos: horas disponíveis, disciplinas e data da prova. O ciclo é gerado ao final e pode ser
          ajustado depois.
        </p>
      </div>
      <OnboardingWizard
        key={examId}
        examId={examId}
        existing={existing}
        defaultAvailability={me.data?.profile.weeklyAvailability ?? null}
      />
    </div>
  );
}
