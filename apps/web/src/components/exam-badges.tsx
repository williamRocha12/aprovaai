import { SITUATION_LABELS, type ExamSummary } from "@aprovaai/shared";
import { Badge } from "@/components/ui/feedback";
import { formatDateBr } from "@/lib/plan-ui";

/** Situação e data nunca aparecem como confirmadas sem fonte oficial. */
export function ExamBadges({ exam }: { exam: ExamSummary }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {exam.isSample && <Badge tone="warning">Exemplo</Badge>}
      {exam.isPrivate && <Badge>Privado</Badge>}
      {exam.contentStatus !== "validado" && (
        <Badge tone="danger">{exam.contentStatus === "rascunho" ? "Rascunho" : "Em revisão"}</Badge>
      )}
      <Badge tone={exam.situationConfirmed ? "success" : "neutral"}>
        {SITUATION_LABELS[exam.situation]}
        {!exam.situationConfirmed && " (não confirmado)"}
      </Badge>
      <Badge tone={exam.datesConfirmed && exam.examDate ? "success" : "neutral"}>
        Prova: {exam.datesConfirmed ? formatDateBr(exam.examDate) : "data não confirmada"}
      </Badge>
    </span>
  );
}
