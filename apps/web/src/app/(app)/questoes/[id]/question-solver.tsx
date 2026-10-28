"use client";

import {
  ERROR_TYPES,
  ERROR_TYPE_LABELS,
  type AttemptDto,
  type ErrorTypeValue,
  type QuestionDetail,
} from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatDateBr } from "@/lib/plan-ui";
import { cn, formatDateTime } from "@/lib/utils";

interface AttemptResult {
  attempt: AttemptDto;
  correctAnswer: string | null;
  explanation: string | null;
  review: { stage: number; dueDate: string; status: "ativa" | "dominada" } | null;
}

const ORIGIN_LABELS = {
  oficial: "Explicação oficial",
  autoral: "Explicação autoral",
  gerado_por_ia: "Gerado por IA",
} as const;

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function QuestionSolver({
  id,
  reviewMode,
  filters,
}: {
  id: string;
  reviewMode: boolean;
  filters: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const question = useQuery({
    queryKey: ["question", id],
    queryFn: () => api.get<QuestionDetail>(`/api/questions/${id}`),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [classified, setClassified] = useState<ErrorTypeValue | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const startedAt = useRef<number | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [id]);

  const answer = useMutation({
    mutationFn: () => {
      idempotencyKey.current ??= newKey();
      const timeSpentSec = startedAt.current
        ? Math.round((Date.now() - startedAt.current) / 1000)
        : undefined;
      return api.post<AttemptResult>(`/api/questions/${id}/attempts`, {
        answer: selected,
        timeSpentSec,
        context: reviewMode ? "revisao" : "avulsa",
        idempotencyKey: idempotencyKey.current,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      idempotencyKey.current = null;
      void queryClient.invalidateQueries({ queryKey: ["question", id] });
      void queryClient.invalidateQueries({ queryKey: ["questions"] });
    },
  });

  const classify = useMutation({
    mutationFn: (errorType: ErrorTypeValue) =>
      api.patch(`/api/attempts/${result?.attempt.id}`, { errorType }),
    onSuccess: (_d, errorType) => setClassified(errorType),
  });

  const favorite = useMutation({
    mutationFn: () => api.post<{ isFavorite: boolean }>(`/api/questions/${id}/favorite`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["question", id] }),
  });

  const saveNote = useMutation({
    mutationFn: (body: string) => api.request("PUT", `/api/questions/${id}/note`, { body }),
    onSuccess: () => setMessage({ kind: "success", text: "Anotação salva." }),
    onError: (err) => setMessage({ kind: "error", text: errorMessage(err) }),
  });

  const report = useMutation({
    mutationFn: () => api.post(`/api/questions/${id}/reports`, { reason: reportReason }),
    onSuccess: () => {
      setReportOpen(false);
      setReportReason("");
      setMessage({ kind: "success", text: "Obrigado! Um editor vai revisar a questão." });
    },
    onError: (err) => setMessage({ kind: "error", text: errorMessage(err) }),
  });

  async function goNext() {
    const params = new URLSearchParams(filters);
    params.set("exclude", id);
    if (!params.has("status")) params.set("status", "nao_respondidas");
    try {
      const { id: nextId } = await api.get<{ id: string | null }>(`/api/questions/next?${params.toString()}`);
      if (nextId) router.push(`/questoes/${nextId}?${filters}`);
      else setMessage({ kind: "success", text: "Você resolveu todas as questões deste filtro." });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    }
  }

  if (question.isPending) return <LoadingState label="Carregando questão..." />;
  if (question.isError) return <Alert variant="error">{errorMessage(question.error)}</Alert>;
  const q = question.data;
  const canAnswer = Boolean(q.statement) && !q.annulled;
  const noteValue = note ?? q.note ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={reviewMode ? "/revisoes" : `/questoes?${filters}`}
          className="text-sm text-primary hover:underline"
        >
          ← {reviewMode ? "Revisões" : "Questões"}
        </Link>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => favorite.mutate()} loading={favorite.isPending}>
            {q.isFavorite ? "★ Favorita" : "☆ Favoritar"}
          </Button>
          {!reviewMode && (
            <Button size="sm" variant="outline" onClick={goNext}>
              Próxima questão
            </Button>
          )}
        </div>
      </div>

      {message && <Alert variant={message.kind}>{message.text}</Alert>}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {reviewMode && <Badge tone="warning">Revisão</Badge>}
          {q.isSample && <Badge tone="warning">Exemplo autoral</Badge>}
          {q.isPrivate && <Badge>Minha questão</Badge>}
          {q.annulled && <Badge tone="danger">Anulada</Badge>}
          <span className="text-muted-foreground">
            {[q.subjectName, q.topicName, q.board, q.organization, q.year].filter(Boolean).join(" · ")}
          </span>
        </div>

        {q.statement ? (
          <p className="whitespace-pre-line leading-relaxed">{q.statement}</p>
        ) : (
          <Alert variant="info">
            Questão registrada de outra plataforma ({q.externalSource ?? "origem não informada"}). O enunciado
            não é copiado; aqui ficam só o seu histórico e as revisões.
          </Alert>
        )}

        {canAnswer && (
          <fieldset className="space-y-2" disabled={Boolean(result)}>
            <legend className="sr-only">Alternativas</legend>
            {q.options.map((o) => {
              const isAnswer = result?.correctAnswer === o.label;
              const isWrongPick = result && selected === o.label && !isAnswer;
              return (
                <label
                  key={o.label}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm",
                    selected === o.label ? "border-primary bg-muted" : "border-border",
                    isAnswer && "border-success bg-success-soft",
                    isWrongPick && "border-danger bg-danger-soft",
                  )}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={o.label}
                    checked={selected === o.label}
                    onChange={() => setSelected(o.label)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    <strong>{o.label})</strong> {o.text}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        {answer.error && <Alert variant="error">{errorMessage(answer.error)}</Alert>}
        {canAnswer && !result && (
          <Button onClick={() => answer.mutate()} disabled={!selected} loading={answer.isPending}>
            Responder
          </Button>
        )}

        {result && (
          <div className="space-y-3">
            <Alert
              variant={result.attempt.isCorrect ? "success" : "error"}
              title={result.attempt.isCorrect ? "Você acertou!" : "Você errou"}
            >
              Gabarito: <strong>{result.correctAnswer}</strong>
              {result.review &&
                (result.review.status === "dominada"
                  ? " · Questão dominada: saiu da fila de revisão."
                  : ` · Próxima revisão em ${formatDateBr(result.review.dueDate)}.`)}
            </Alert>
            {result.explanation && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">
                  {q.explanationOrigin ? ORIGIN_LABELS[q.explanationOrigin] : "Explicação"}
                </p>
                <p className="whitespace-pre-line">{result.explanation}</p>
              </div>
            )}
            {!result.attempt.isCorrect && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Por que você errou? (ajusta o tipo dos próximos blocos)</p>
                <div className="flex flex-wrap gap-2">
                  {ERROR_TYPES.map((t) => (
                    <Button
                      key={t}
                      size="sm"
                      variant={classified === t ? "primary" : "outline"}
                      onClick={() => classify.mutate(t)}
                      loading={classify.isPending && classify.variables === t}
                    >
                      {ERROR_TYPE_LABELS[t]}
                    </Button>
                  ))}
                </div>
                {classify.error && <Alert variant="error">{errorMessage(classify.error)}</Alert>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {reviewMode ? (
                <Link href="/revisoes" className={buttonVariants()}>
                  Voltar às revisões
                </Link>
              ) : (
                <Button onClick={goNext}>Próxima questão</Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setSelected(null);
                  setClassified(null);
                  startedAt.current = Date.now();
                }}
              >
                Responder de novo
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <label htmlFor="note" className="font-semibold">
          Minha anotação
        </label>
        <textarea
          id="note"
          value={noteValue}
          maxLength={5000}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border border-border bg-surface p-3 text-sm"
          placeholder="Pegadinhas, artigo de lei, macetes..."
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => saveNote.mutate(noteValue.trim())}
          loading={saveNote.isPending}
        >
          Salvar anotação
        </Button>
      </Card>

      {q.history.length > 0 && (
        <Card>
          <h2 className="font-semibold">Histórico</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {q.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {h.isCorrect ? <Badge tone="success">Certo</Badge> : <Badge tone="danger">Errado</Badge>}{" "}
                  resposta {h.answer ?? "—"}
                  {h.errorType && ` · ${ERROR_TYPE_LABELS[h.errorType]}`}
                  {h.context === "revisao" && " · revisão"}
                </span>
                <span className="text-muted-foreground">{formatDateTime(h.answeredAt)}</span>
              </li>
            ))}
          </ul>
          {q.review && (
            <p className="mt-2 text-sm text-muted-foreground">
              {q.review.status === "dominada"
                ? "Dominada (fora da fila)."
                : `Próxima revisão: ${formatDateBr(q.review.dueDate)}.`}
            </p>
          )}
        </Card>
      )}

      {!q.isPrivate && (
        <div className="text-sm">
          {reportOpen ? (
            <Card className="space-y-2">
              <label htmlFor="report" className="font-medium">
                O que está errado nesta questão?
              </label>
              <textarea
                id="report"
                value={reportReason}
                maxLength={2000}
                rows={3}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-md border border-border bg-surface p-3"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => report.mutate()}
                  disabled={reportReason.trim().length < 10}
                  loading={report.isPending}
                >
                  Enviar reporte
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReportOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </Card>
          ) : (
            <button
              type="button"
              className="text-muted-foreground underline"
              onClick={() => setReportOpen(true)}
            >
              Reportar erro nesta questão
            </button>
          )}
        </div>
      )}
    </div>
  );
}
