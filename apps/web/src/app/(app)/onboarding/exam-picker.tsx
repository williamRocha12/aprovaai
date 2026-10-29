"use client";

import {
  BRAZIL_REGIONS,
  SITUATION_LABELS,
  UF_NAMES,
  type BrazilUf,
  type ExamSummary,
  type OpenExamCounts,
} from "@aprovaai/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useRef, useState } from "react";
import { ExamFacts } from "@/components/exam-facts";
import { useGoals } from "@/components/goal-context";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "" = todos; "BR" = só nacionais (sem UF); senão a sigla do estado. */
export type Region = "" | "BR" | BrazilUf;

function regionLabel(region: Region): string {
  if (region === "") return "todo o Brasil";
  if (region === "BR") return "âmbito nacional";
  return UF_NAMES[region];
}

/**
 * Passo 1, no modelo do PCI Concursos: estados agrupados por região com o nº de concursos abertos;
 * clicar no estado lista os concursos dele. Clicar no concurso abre a página do edital (passo 2).
 */
export function ExamPicker({ initialRegion }: { initialRegion: Region }) {
  const router = useRouter();
  const { goals } = useGoals();
  const listRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<Region>(initialRegion);
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [includeNational, setIncludeNational] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());

  const counts = useQuery({
    queryKey: ["catalog", "open-counts"],
    queryFn: () => api.get<OpenExamCounts>("/api/catalog/open-counts"),
  });

  const params = new URLSearchParams({ pageSize: "50" });
  if (deferredSearch) params.set("search", deferredSearch);
  if (onlyOpen) params.set("open", "true");
  if (region === "BR") params.set("national", "true");
  else if (region) {
    params.set("uf", region);
    if (includeNational) params.set("includeNational", "true");
  }
  const exams = useQuery({
    queryKey: ["catalog", params.toString()],
    queryFn: () =>
      api.get<{ items: ExamSummary[]; total: number }>(`/api/catalog/exams?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  function choose(next: Region) {
    setRegion(next);
    // Estado na URL: o link pode ser guardado ou compartilhado (ex.: /onboarding?uf=SC).
    router.replace(next ? `/onboarding?uf=${next}` : "/onboarding", { scroll: false });
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Concursos que o usuário já estuda (ativos ou pausados) não podem ser adicionados de novo. */
  const studying = new Set(goals.filter((g) => g.status !== "encerrado").map((g) => g.examId));
  const byUf = counts.data?.byUf ?? {};

  return (
    <div className="space-y-6">
      <OnboardingSteps current={1} />

      <section aria-label="Concursos por estado" className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <RegionButton active={region === ""} onClick={() => choose("")} count={counts.data?.total}>
            Todos
          </RegionButton>
          <RegionButton active={region === "BR"} onClick={() => choose("BR")} count={counts.data?.national}>
            Nacionais (federais)
          </RegionButton>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {BRAZIL_REGIONS.map((r) => (
            <div key={r.name}>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {r.name}
              </h2>
              <ul className="space-y-0.5">
                {r.ufs.map((uf) => (
                  <li key={uf}>
                    <button
                      type="button"
                      onClick={() => choose(uf)}
                      aria-pressed={region === uf}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm",
                        region === uf ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <span>
                        <span className="font-medium">{uf}</span>{" "}
                        <span className={region === uf ? "" : "text-muted-foreground"}>{UF_NAMES[uf]}</span>
                      </span>
                      <span className="tabular-nums">{counts.data ? (byUf[uf] ?? 0) : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          O número ao lado de cada estado é a quantidade de concursos em aberto no catálogo.
        </p>
      </section>

      <section ref={listRef} aria-label="Lista de concursos" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Concursos em {regionLabel(region)}</h2>
        <Input
          placeholder="Buscar por órgão ou concurso"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar concurso"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Somente em aberto
          </label>
          {region && region !== "BR" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeNational}
                onChange={(e) => setIncludeNational(e.target.checked)}
              />
              Incluir também os nacionais (federais)
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
            title={`Nenhum concurso ${onlyOpen ? "em aberto " : ""}em ${regionLabel(region)} no catálogo.`}
            description="Novos concursos entram depois de conferidos na fonte oficial. Você também pode cadastrar o seu a partir do edital."
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
      </section>
    </div>
  );
}

function RegionButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
      )}
    >
      {children}
      {count !== undefined && <span className="ml-1 tabular-nums">({count})</span>}
    </button>
  );
}
