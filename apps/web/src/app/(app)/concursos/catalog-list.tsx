"use client";

import { BRAZIL_UFS, EXAM_SITUATIONS, SITUATION_LABELS, type ExamSummary } from "@aprovaai/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ExamBadges } from "@/components/exam-badges";
import { ExamFacts } from "@/components/exam-facts";
import { buttonVariants } from "@/components/ui/button";
import { Alert, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

export function CatalogList() {
  const [search, setSearch] = useState("");
  const [situation, setSituation] = useState("");
  const [uf, setUf] = useState("");
  const [board, setBoard] = useState("");
  const deferredSearch = useDeferredValue(search.trim());

  const params = new URLSearchParams({ pageSize: "50" });
  if (deferredSearch) params.set("search", deferredSearch);
  if (situation === "abertos") params.set("open", "true");
  else if (situation) params.set("situation", situation);
  if (uf) params.set("uf", uf);
  if (board) params.set("board", board);

  const exams = useQuery({
    queryKey: ["catalog-list", params.toString()],
    queryFn: () =>
      api.get<{ items: ExamSummary[]; total: number }>(`/api/catalog/exams?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
  const boards = useQuery({
    queryKey: ["boards"],
    queryFn: () => api.get<{ slug: string; name: string }[]>("/api/catalog/boards"),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Concursos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo com editais verticalizados. Datas só aparecem como confirmadas com fonte oficial.
          </p>
        </div>
        <Link href="/concursos/importar" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cadastrar a partir do edital
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Input
          aria-label="Buscar"
          placeholder="Buscar por órgão ou concurso"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select aria-label="Situação" value={situation} onChange={(e) => setSituation(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="abertos">Em aberto (não encerrados)</option>
          {EXAM_SITUATIONS.map((s) => (
            <option key={s} value={s}>
              {SITUATION_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="UF" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Todas as UFs</option>
          {BRAZIL_UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Select aria-label="Banca" value={board} onChange={(e) => setBoard(e.target.value)}>
          <option value="">Todas as bancas</option>
          {(boards.data ?? []).map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>

      {exams.isPending ? (
        <LoadingState label="Carregando concursos..." />
      ) : exams.isError ? (
        <Alert variant="error">{errorMessage(exams.error)}</Alert>
      ) : exams.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum concurso encontrado."
          description="Ajuste os filtros ou cadastre o seu a partir do edital."
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {exams.data.items.map((exam) => (
            <li key={exam.id}>
              <Link
                href={`/concursos/${exam.id}`}
                className="block h-full rounded-lg border border-border bg-surface p-4 hover:border-primary"
              >
                <p className="font-medium text-primary">{exam.title}</p>
                <p className="mb-2 text-sm text-muted-foreground">
                  {exam.organization}
                  {exam.board ? ` · ${exam.board}` : ""}
                  {exam.uf ? ` · ${exam.uf}` : ""}
                </p>
                <div className="mb-2">
                  <ExamFacts exam={exam} />
                </div>
                <ExamBadges exam={exam} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
