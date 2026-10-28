import type { Goal, MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import { serverGet } from "@/lib/server-api";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Configurar plano" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ concurso?: string }>;
}) {
  const { concurso } = await searchParams;
  const [goal, me] = await Promise.all([serverGet<Goal>("/api/goal"), serverGet<MeResponse>("/api/me")]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {goal.data ? "Editar plano de estudos" : "Vamos montar seu plano"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Quatro passos: concurso, horas disponíveis, disciplinas e data da prova. Tudo pode ser alterado
          depois.
        </p>
      </div>
      <OnboardingWizard
        existing={goal.data}
        preselectedExamId={concurso ?? null}
        defaultAvailability={me.data?.profile.weeklyAvailability ?? null}
      />
    </div>
  );
}
