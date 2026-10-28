"use client";

import { ERROR_TYPE_LABELS, type ErrorNotebookEntry, type ErrorTypeValue } from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { subjectsOf, useGoalTopics } from "@/components/questions/use-goal-topics";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { formatDateBr } from "@/lib/plan-ui";
import { cn, formatDateTime } from "@/lib/utils";

interface Notebook {
  distribution: { errorType: ErrorTypeValue | null; count: number }[];
  entries: ErrorNotebookEntry[];
}

export default function ErrorNotebookPage() {
  const topics = useGoalTopics();
  const [subjectId, setSubjectId] = useState("");
  const [errorType, setErrorType] = useState<ErrorTypeValue | "">("");
  const params = new URLSearchParams();
  if (subjectId) params.set("subjectId", subjectId);
  if (errorType) params.set("errorType", errorType);

  const notebook = useQuery({
    queryKey: ["error-notebook", params.toString()],
    queryFn: () => api.get<Notebook>(`/api/error-notebook?${params.toString()}`),
  });
  const total = notebook.data?.distribution.reduce((s, d) => s + d.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Caderno de erros</h1>
        <p className="text-sm text-muted-foreground">
          Toda questão que você errou, com o motivo do último erro. O motivo decide o tipo dos próximos blocos
          do seu ciclo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select aria-label="Disciplina" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">Todas as disciplinas</option>
          {subjectsOf(topics.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Tipo de erro"
          value={errorType}
          onChange={(e) => setErrorType(e.target.value as ErrorTypeValue | "")}
        >
          <option value="">Todos os tipos de erro</option>
          {Object.entries(ERROR_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {notebook.isPending ? (
        <LoadingState label="Carregando caderno..." />
      ) : notebook.isError ? (
        <Alert variant="error">{errorMessage(notebook.error)}</Alert>
      ) : notebook.data.entries.length === 0 ? (
        <EmptyState
          title="Nenhum erro registrado com esses filtros."
          description="Erros em questões resolvidas ou registradas aparecem aqui."
        />
      ) : (
        <>
          <section aria-label="Distribuição dos erros" className="flex flex-wrap gap-2">
            {notebook.data.distribution
              .sort((a, b) => b.count - a.count)
              .map((d) => (
                <span key={d.errorType ?? "sem"} className="rounded-full bg-muted px-3 py-1 text-sm">
                  {d.errorType ? ERROR_TYPE_LABELS[d.errorType] : "Sem classificação"}:{" "}
                  <strong>{d.count}</strong> ({Math.round((d.count / total) * 100)}%)
                </span>
              ))}
          </section>
          <ul className="space-y-2">
            {notebook.data.entries.map((e) => (
              <li key={e.questionId}>
                <Link
                  href={`/questoes/${e.questionId}`}
                  className={cn("block rounded-lg border border-border bg-surface p-4 hover:border-primary")}
                >
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <Badge tone="danger">
                      {e.wrongCount} erro{e.wrongCount > 1 ? "s" : ""}
                    </Badge>
                    {e.lastErrorType ? (
                      <Badge tone="warning">{ERROR_TYPE_LABELS[e.lastErrorType]}</Badge>
                    ) : (
                      <Badge>Classificar erro</Badge>
                    )}
                    {e.review &&
                      (e.review.status === "dominada" ? (
                        <Badge tone="success">Dominada</Badge>
                      ) : (
                        <Badge>Revisão em {formatDateBr(e.review.dueDate)}</Badge>
                      ))}
                    <span className="text-muted-foreground">
                      {[e.subjectName, e.topicName, e.board].filter(Boolean).join(" · ")} · último erro{" "}
                      {formatDateTime(e.lastWrongAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{e.statementPreview ?? "Questão sem enunciado"}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
