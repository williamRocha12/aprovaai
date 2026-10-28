"use client";

import { PAST_EXAM_STATUS_LABELS, type PastExamDetail } from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, LoadingState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

const CONFIDENCE = {
  alta: "IA: confiança alta",
  media: "IA: confiança média",
  baixa: "IA: confiança baixa",
} as const;

export function PastExamDetailView({ isEditor }: { isEditor: boolean }) {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const exam = useQuery({
    queryKey: ["past-exam", id],
    queryFn: () => api.get<PastExamDetail>(`/api/past-exams/${id}`),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["past-exam", id] });

  const review = useMutation({
    mutationFn: ({ itemId, topicId }: { itemId: string; topicId: string | null }) => {
      const subjectId = exam.data?.taxonomy.find((t) => t.topicId === topicId)?.subjectId ?? null;
      return api.patch(`/api/past-exams/${id}/items/${itemId}`, { subjectId, topicId });
    },
    onSuccess: refresh,
  });
  const finish = useMutation({
    mutationFn: () => api.post(`/api/past-exams/${id}/finish-review`),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: () => api.post<{ published: number }>(`/api/past-exams/${id}/publish`),
    onSuccess: refresh,
  });

  if (exam.isPending) return <LoadingState label="Carregando prova..." />;
  if (exam.isError) return <Alert variant="error">{errorMessage(exam.error)}</Alert>;
  const e = exam.data;

  const error = review.error ?? finish.error ?? publish.error;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/provas" className="text-sm text-primary hover:underline">
          ← Provas anteriores
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {e.board} {e.year} — {e.organization}
        </h1>
        <p className="text-sm text-muted-foreground">
          {e.positionTitle} · {e.questionCount} questões ·{" "}
          <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            prova na fonte oficial
          </a>
          {e.answerKeyUrl && (
            <>
              {" · "}
              <a
                href={e.answerKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                gabarito oficial
              </a>
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge tone={e.status === "processado" ? "success" : e.status === "erro" ? "danger" : "warning"}>
            {PAST_EXAM_STATUS_LABELS[e.status]}
          </Badge>
          <Badge>Crédito: {e.board}</Badge>
        </div>
      </div>

      {e.errorMessage && (
        <Alert variant="error" title="Falha no processamento">
          {e.errorMessage}
        </Alert>
      )}
      {e.parseWarnings.length > 0 && (
        <Alert variant="warning" title="Avisos da leitura automática">
          <ul className="list-disc pl-4">
            {e.parseWarnings.slice(0, 10).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
      {!e.fullTextVisible && (
        <Alert variant="info">
          O texto integral das questões fica disponível na fonte oficial. Aqui aparecem só os dados usados no
          Raio-X.
        </Alert>
      )}
      {error && <Alert variant="error">{errorMessage(error)}</Alert>}
      {publish.data && (
        <Alert variant="success">{publish.data.published} questão(ões) publicadas no banco.</Alert>
      )}

      {isEditor && (
        <div className="flex flex-wrap gap-2">
          {e.status === "em_revisao" && (
            <Button onClick={() => finish.mutate()} loading={finish.isPending}>
              Concluir revisão
            </Button>
          )}
          {e.status === "processado" && (
            <Button variant="outline" onClick={() => publish.mutate()} loading={publish.isPending}>
              Publicar no banco de questões
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {e.items.map((item) => (
          <Card key={item.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <strong className="text-sm">Questão {item.number}</strong>
              {item.annulled && <Badge tone="danger">Anulada</Badge>}
              {item.correctAnswer && <Badge>Gabarito {item.correctAnswer}</Badge>}
              {item.confidence && (
                <Badge tone={item.confidence === "baixa" ? "warning" : "neutral"}>
                  {CONFIDENCE[item.confidence]}
                </Badge>
              )}
              {item.needsReview && <Badge tone="warning">Aguardando revisão</Badge>}
              {item.published && <Badge tone="success">No banco</Badge>}
              <span className="text-muted-foreground">
                {[item.subjectName, item.topicName].filter(Boolean).join(" › ") || "Sem assunto"}
              </span>
            </div>
            {item.statement && <p className="whitespace-pre-line text-sm">{item.statement}</p>}
            {item.options.length > 0 && (
              <ul className="text-sm text-muted-foreground">
                {item.options.map((o) => (
                  <li key={o.label}>
                    {o.label}) {o.text}
                  </li>
                ))}
              </ul>
            )}
            {isEditor && e.taxonomy.length > 0 && (
              <div className="max-w-md">
                <label htmlFor={`topic-${item.id}`} className="sr-only">
                  Assunto da questão {item.number}
                </label>
                <Select
                  id={`topic-${item.id}`}
                  value={item.topicId ?? ""}
                  onChange={(ev) => review.mutate({ itemId: item.id, topicId: ev.target.value || null })}
                  disabled={review.isPending}
                >
                  <option value="">Sem assunto (não entra nas estatísticas por assunto)</option>
                  {e.taxonomy.map((t) => (
                    <option key={t.topicId} value={t.topicId}>
                      {t.subjectName} › {t.topicName}
                    </option>
                  ))}
                </Select>
                {item.needsReview && item.topicId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => review.mutate({ itemId: item.id, topicId: item.topicId })}
                  >
                    Confirmar sugestão
                  </Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
