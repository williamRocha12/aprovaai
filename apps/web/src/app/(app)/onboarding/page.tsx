import { BRAZIL_UFS, type BrazilUf, type Goal, type MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { serverGet } from "@/lib/server-api";
import { ExamPicker, type Region } from "./exam-picker";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Configurar plano" };

/** `?uf=SC` abre a lista já filtrada; `?uf=BR` mostra só os nacionais. Valor inválido = todos. */
function parseRegion(value: string | undefined): Region {
  const upper = value?.toUpperCase() ?? "";
  if (upper === "BR") return "BR";
  return (BRAZIL_UFS as readonly string[]).includes(upper) ? (upper as BrazilUf) : "";
}

/**
 * Fluxo em duas telas:
 * 1. sem parâmetros: estados com o nº de concursos abertos e a lista do estado escolhido;
 * 2. `concurso=<examId>`: configuração do plano do concurso escolhido.
 * `editar=<goalId>` abre a configuração de um plano existente.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ concurso?: string; editar?: string; uf?: string }>;
}) {
  const { concurso, editar, uf } = await searchParams;
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
          <h1 className="text-2xl font-semibold">Concursos abertos</h1>
          <p className="text-sm text-muted-foreground">
            Clique no seu estado para ver os concursos abertos e abra o concurso para ver o edital. De lá você
            monta o plano de estudos.
          </p>
        </div>
        <ExamPicker initialRegion={parseRegion(uf)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!existing && <OnboardingSteps current={3} />}
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
