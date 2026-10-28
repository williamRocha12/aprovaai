import type { ExamSummary } from "@aprovaai/shared";
import { formatDateBr } from "@/lib/plan-ui";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Linha de resumo no estilo das listas de concursos: vagas, salário e prazo de inscrição (só o que é conhecido). */
export function ExamFacts({ exam }: { exam: ExamSummary }) {
  const facts = [
    exam.vacancies
      ? `${exam.vacancies.toLocaleString("pt-BR")} vaga${exam.vacancies === 1 ? "" : "s"}`
      : null,
    exam.positionCount > 1 ? `${exam.positionCount} cargos` : null,
    exam.salaryMax ? `até ${money.format(exam.salaryMax)}` : null,
    exam.registrationEnd ? `inscrições até ${formatDateBr(exam.registrationEnd)}` : null,
  ].filter(Boolean);
  if (facts.length === 0) return null;
  return <span className="block text-sm font-medium text-foreground">{facts.join(" · ")}</span>;
}
