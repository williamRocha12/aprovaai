"use client";

import { BRAZIL_UFS, SITUATION_LABELS, type ExamSummary } from "@aprovaai/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ExamFacts } from "@/components/exam-facts";
import { useGoals } from "@/components/goal-context";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

/** Passo 1: lista de concursos por estado. Clicar abre a página do edital (passo 2). */
export function ExamPicker() {
  const { goals } = useGoals();
  const [search, setSearch] = useState("");
  const [uf, setUf] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [includeNational, setIncludeNational] = useState(true);
  const deferredSearch = useDeferredValue(search.trim());

  const params = new URLSearchParams({ pageSize: "50" });
  if (deferredSearch) params.set("search", deferredSearch);
  if (onlyOpen) params.set("open", "true");
  if (uf) {
    params.set("uf", uf);
    if (includeNational) params.set("includeNational", "true");
  }
  const exams = useQuery({
    queryKey: ["catalog", params.toString()],
    queryFn: () =>
      api.get<{ items: ExamSummary[]; total: number }>(`/api/catalog/exams?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  /** Concursos que o usuário já estuda (ativos ou pausados) não podem ser adicionados de novo. */
  const studying = new Set(goals.filter((g) => g.status !== "encerrado").map((g) => g.examId));

  return (
    <div className="space-y-4">
      <OnboardingSteps current={1} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Select aria-label="Estado" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todos os estados</option>
          {BRAZIL_UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Buscar por órgão ou concurso"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar concurso"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Somente em aberto
        </label>
        {uf && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeNational}
              onChange={(e) => setIncludeNational(e.target.checked)}
            />
            Incluir concursos nacionais (federais)
          </label>
        )}
        {exams.data && (
          <span className="text-muted-foreground">
            {exams.data.total} concurso{exams.data.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {exams.isPending ? (
        <LoadingState label="Carregando concursos..." />
      ) : exams.isError ? (
        <Alert variant="error">{errorMessage(exams.error)}</Alert>
      ) : exams.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum concurso encontrado com esses filtros."
          description="Tente outro estado ou cadastre o seu a partir do edital."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Concursos">
          {exams.data.items.map((e) => {
            const already = studying.has(e.id);
            return (
              <li key={e.id}>
                <Link
                  href={`/concursos/${e.id}?origem=lista`}
                  className="block h-full rounded-lg border border-border bg-surface p-4 hover:border-primary hover:bg-muted"
                >
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="font-medium text-primary">{e.title}</span>
                    {e.isSample && <Badge tone="warning">Exemplo</Badge>}
                    {e.isPrivate && <Badge>Privado</Badge>}
                    {already && <Badge tone="success">Você já estuda</Badge>}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {e.organization}
                    {e.board ? ` · ${e.board}` : ""}
                    {e.uf ? ` · ${e.uf}` : " · Nacional"} · {SITUATION_LABELS[e.situation]}
                    {!e.situationConfirmed && " (não confirmado)"}
                  </span>
                  <span className="mt-1 block">
                    <ExamFacts exam={e} />
                  </span>
                  {!e.hasNotice && (
                    <span className="mt-1 block text-xs text-warning">
                      Conteúdo programático em preparação.
                    </span>
                  )}
                  <span className="mt-2 block text-sm font-medium text-primary">Ver edital →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        A lista mostra os concursos do catálogo, conferidos a partir de fontes oficiais. “Em aberto” inclui
        previstos, autorizados e com edital publicado. Não achou o seu?{" "}
        <Link href="/concursos/importar" className="text-primary underline">
          Cadastre a partir do edital
        </Link>
        .
      </p>
    </div>
  );
}
