"use client";

import type { QuestionDetail } from "@aprovaai/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card } from "@/components/ui/feedback";
import { usePublicConfig } from "@/components/use-public-config";
import { api, errorMessage } from "@/lib/api";

interface Explanation {
  explanation: string;
  hasEvidence: boolean;
  cached: boolean;
}

interface Suggestion {
  topicId: string | null;
  subjectId: string | null;
  topicName: string | null;
  subjectName: string | null;
  confidence: "alta" | "media" | "baixa";
  reason: string;
}

const CONFIDENCE_LABEL = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
} as const;

/** Explicação e classificação por IA. Só aparece com a IA ligada; tudo marcado como "gerado por IA". */
export function AiQuestionTools({ question, revealed }: { question: QuestionDetail; revealed: boolean }) {
  const config = usePublicConfig();
  const queryClient = useQueryClient();
  const explain = useMutation({
    mutationFn: () => api.post<Explanation>(`/api/ai/questions/${question.id}/explain`),
  });
  const classify = useMutation({
    mutationFn: () => api.post<Suggestion>(`/api/ai/questions/${question.id}/classify`),
  });
  const apply = useMutation({
    mutationFn: (s: Suggestion) =>
      api.patch(`/api/questions/${question.id}/taxonomy`, { subjectId: s.subjectId, topicId: s.topicId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["question", question.id] }),
  });

  if (!config.data?.aiEnabled || !question.statement) return null;
  const canClassify = question.isPrivate && !question.topicName;
  if (!revealed && !canClassify) return null;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Ajuda da IA</h2>
        <Badge tone="warning">Gerado por IA</Badge>
      </div>

      {revealed && !explain.data && (
        <Button variant="outline" size="sm" onClick={() => explain.mutate()} loading={explain.isPending}>
          Explicar esta questão
        </Button>
      )}
      {explain.error && <Alert variant="error">{errorMessage(explain.error)}</Alert>}
      {explain.data && (
        <div className="space-y-2 text-sm">
          {!explain.data.hasEvidence && (
            <Alert variant="warning">
              A IA não encontrou base segura para justificar o gabarito. Confira na fonte oficial.
            </Alert>
          )}
          <p className="whitespace-pre-line">{explain.data.explanation}</p>
          <p className="text-xs text-muted-foreground">
            Gerado por IA. Pode conter erros: confira artigos de lei e jurisprudência na fonte oficial.
          </p>
        </div>
      )}

      {canClassify && !classify.data && (
        <Button variant="outline" size="sm" onClick={() => classify.mutate()} loading={classify.isPending}>
          Sugerir assunto do edital
        </Button>
      )}
      {classify.error && <Alert variant="error">{errorMessage(classify.error)}</Alert>}
      {classify.data &&
        (classify.data.topicId ? (
          <div className="space-y-2 text-sm">
            <p>
              Sugestão:{" "}
              <strong>
                {classify.data.subjectName} › {classify.data.topicName}
              </strong>{" "}
              ({CONFIDENCE_LABEL[classify.data.confidence]})
            </p>
            <p className="text-muted-foreground">{classify.data.reason}</p>
            {apply.isSuccess ? (
              <Alert variant="success">Assunto aplicado à sua questão.</Alert>
            ) : (
              <Button size="sm" onClick={() => apply.mutate(classify.data)} loading={apply.isPending}>
                Aplicar sugestão
              </Button>
            )}
            {apply.error && <Alert variant="error">{errorMessage(apply.error)}</Alert>}
          </div>
        ) : (
          <Alert variant="info">
            A IA não encontrou um assunto do seu edital que corresponda a esta questão.
          </Alert>
        ))}
    </Card>
  );
}
