import { cn } from "@/lib/utils";

const STEPS = ["Escolher concurso", "Ver edital", "Montar plano"] as const;

/** Trilha do fluxo de novo concurso: lista → página do edital → configuração do plano. */
export function OnboardingSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="grid grid-cols-3 gap-2 text-xs sm:text-sm" aria-label="Etapas">
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <li
            key={label}
            aria-current={n === current ? "step" : undefined}
            className={cn(
              "rounded-md border px-2 py-1.5 text-center",
              n === current
                ? "border-primary bg-primary text-primary-foreground"
                : n < current
                  ? "border-success text-success"
                  : "border-border text-muted-foreground",
            )}
          >
            {n}. {label}
          </li>
        );
      })}
    </ol>
  );
}
