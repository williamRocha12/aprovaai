"use client";

import type { QuestionSummary } from "@aprovaai/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { subjectsOf, useGoalTopics } from "@/components/questions/use-goal-topics";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "todas", label: "Todas" },
  { value: "nao_respondidas", label: "Não respondidas" },
  { value: "erradas", label: "Erradas (última tentativa)" },
  { value: "favoritas", label: "Favoritas" },
];
const SCOPE_OPTIONS = [
  { value: "todas", label: "Catálogo + minhas" },
  { value: "catalogo", label: "Só catálogo" },
  { value: "minhas", label: "Só minhas" },
];

export function QuestionBank() {
  const topics = useGoalTopics();
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [status, setStatus] = useState("todas");
  const [scope, setScope] = useState("todas");
  const [page, setPage] = useState(1);

  const filters = new URLSearchParams({ status, scope });
  if (subjectId) filters.set("subjectId", subjectId);
  if (topicId) filters.set("topicId", topicId);
  const query = new URLSearchParams(filters);
  query.set("page", String(page));

  const questions = useQuery({
    queryKey: ["questions", query.toString()],
    queryFn: () =>
      api.get<{ items: QuestionSummary[]; total: number; pageSize: number }>(
        `/api/questions?${query.toString()}`,
      ),
    placeholderData: keepPreviousData,
  });

  const subjectOptions = subjectsOf(topics.data ?? []);
  const topicOptions = (topics.data ?? []).filter((t) => t.subjectId === subjectId);
  const totalPages = questions.data
    ? Math.max(1, Math.ceil(questions.data.total / questions.data.pageSize))
    : 1;
  const firstOpen = questions.data?.items.find(
    (q) => q.attempts === 0 && !q.statementPreview?.startsWith("Registrada"),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Questões</h1>
          <p className="text-sm text-muted-foreground">
            Resolva, classifique seus erros e eles voltam na revisão de 1, 7 e 30 dias.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/caderno-de-erros" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Caderno de erros
          </Link>
          <Link href="/questoes/registrar" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Registrar questão
          </Link>
          {firstOpen && (
            <Link
              href={`/questoes/${firstOpen.id}?${filters.toString()}`}
              className={buttonVariants({ size: "sm" })}
            >
              Resolver agora
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Select
          aria-label="Disciplina"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setTopicId("");
            setPage(1);
          }}
        >
          <option value="">Todas as disciplinas</option>
          {subjectOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Assunto"
          value={topicId}
          disabled={!subjectId}
          onChange={(e) => {
            setTopicId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os assuntos</option>
          {topicOptions.map((t) => (
            <option key={t.topicId} value={t.topicId}>
              {t.topicName}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Situação"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Origem"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setPage(1);
          }}
        >
          {SCOPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {questions.isPending ? (
        <LoadingState label="Carregando questões..." />
      ) : questions.isError ? (
        <Alert variant="error">{errorMessage(questions.error)}</Alert>
      ) : questions.data.items.length === 0 ? (
        <EmptyState
          title="Nenhuma questão com esses filtros."
          description="O catálogo só traz questões de fontes oficiais ou autorais. Registre as que você resolve em outras plataformas."
        />
      ) : (
        <>
          <ul className="space-y-2">
            {questions.data.items.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/questoes/${q.id}?${filters.toString()}`}
                  className="block rounded-lg border border-border bg-surface p-4 hover:border-primary"
                >
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {q.isSample && <Badge tone="warning">Exemplo</Badge>}
                    {q.isPrivate && <Badge>Minha</Badge>}
                    {q.isFavorite && <Badge>★ Favorita</Badge>}
                    {q.attempts > 0 &&
                      (q.lastCorrect ? (
                        <Badge tone="success">Acertou</Badge>
                      ) : (
                        <Badge tone="danger">Errou</Badge>
                      ))}
                    <span className="text-muted-foreground">
                      {[q.subjectName, q.topicName, q.board, q.year].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{q.statementPreview ?? "Questão sem enunciado"}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {questions.data.total} questão(ões) · página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                className={buttonVariants({ variant: "outline", size: "sm" })}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <button
                className={buttonVariants({ variant: "outline", size: "sm" })}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
