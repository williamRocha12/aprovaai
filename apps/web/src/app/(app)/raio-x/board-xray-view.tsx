"use client";

import type { BoardXray } from "@aprovaai/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ChartTable, HorizontalBarChart } from "@/components/charts/charts";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

const TREND_LABELS = { subindo: "Subindo", caindo: "Caindo", estavel: "Estável" } as const;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);
const TOP_N = 15;

export function BoardXrayView() {
  const [board, setBoard] = useState("");
  const [organization, setOrganization] = useState("");
  const deferredOrg = useDeferredValue(organization.trim());

  const boards = useQuery({
    queryKey: ["xray-boards"],
    queryFn: () => api.get<{ slug: string; name: string; exams: number }[]>("/api/board-xray/boards"),
  });
  const selected = board || boards.data?.[0]?.slug || "";
  const query = deferredOrg ? `?organization=${encodeURIComponent(deferredOrg)}` : "";
  const xray = useQuery({
    queryKey: ["xray", selected, deferredOrg],
    queryFn: () => api.get<BoardXray>(`/api/board-xray/${selected}${query}`),
    enabled: selected !== "",
    placeholderData: keepPreviousData,
  });

  if (boards.isPending) return <LoadingState label="Carregando bancas..." />;
  if (boards.isError) return <Alert variant="error">{errorMessage(boards.error)}</Alert>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Raio-X da banca</h1>
        <p className="text-sm text-muted-foreground">
          O que a banca mais cobrou nas provas oficiais analisadas. É um retrato do passado, não uma previsão
          da próxima prova.
        </p>
      </div>

      {boards.data.length === 0 ? (
        <EmptyState
          title="Ainda não há provas analisadas."
          description="Quando editores importarem e revisarem provas oficiais, o Raio-X aparece aqui."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select aria-label="Banca" value={selected} onChange={(e) => setBoard(e.target.value)}>
              {boards.data.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name} ({b.exams} prova{b.exams === 1 ? "" : "s"})
                </option>
              ))}
            </Select>
            <Input
              aria-label="Filtrar por órgão"
              placeholder="Filtrar por órgão (opcional)"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>
          {xray.isPending ? (
            <LoadingState label="Calculando o Raio-X..." />
          ) : xray.isError ? (
            <Alert variant="error">{errorMessage(xray.error)}</Alert>
          ) : (
            <XrayContent data={xray.data} />
          )}
        </>
      )}
    </div>
  );
}

function XrayContent({ data }: { data: BoardXray }) {
  const { sample, topics, style } = data;
  const period =
    sample.yearFrom === null
      ? ""
      : sample.yearFrom === sample.yearTo
        ? ` de ${sample.yearFrom}`
        : ` de ${sample.yearFrom} a ${sample.yearTo}`;
  const top = topics.slice(0, TOP_N);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          Base: {sample.exams} prova(s), {sample.questions} questões{period}.
        </span>
        <Link href={`/provas?board=${data.board.slug}`} className="text-primary underline">
          Ver provas
        </Link>
      </div>
      {sample.small && (
        <Alert variant="warning" title="Amostra pequena">
          Com poucas provas, as porcentagens mudam muito a cada prova nova. Use como pista, não como regra.
        </Alert>
      )}

      <Card>
        <h2 className="font-semibold">Assuntos mais cobrados (% das questões classificadas)</h2>
        {top.length === 0 ? (
          <EmptyState title="Nenhuma questão com assunto revisado ainda." />
        ) : (
          <>
            <HorizontalBarChart
              unit="%"
              data={top.map((t) => ({
                label: t.topicName,
                value: Math.round(t.share * 1000) / 10,
                tip: pct(t.share),
                detail: `${t.subjectName} · ${t.questionCount} questão(ões) em ${t.examCount} prova(s)`,
              }))}
            />
            <ChartTable
              caption="Incidência por assunto"
              headers={["Assunto", "Disciplina", "Questões", "Provas", "Incidência", "Tendência"]}
              rows={topics.map((t) => [
                t.topicName,
                t.subjectName,
                t.questionCount,
                t.examCount,
                pct(t.share),
                t.trend ? TREND_LABELS[t.trend] : "—",
              ])}
            />
          </>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Estilo da banca</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-muted-foreground">Questões certo/errado</dt>
            <dd className="text-xl font-semibold tabular-nums">{pct(style.certoErradoShare)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Tamanho médio do enunciado</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {style.averageStatementChars === null
                ? "—"
                : `${Math.round(style.averageStatementChars).toLocaleString("pt-BR")} caracteres`}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Questões anuladas</dt>
            <dd className="text-xl font-semibold tabular-nums">{pct(style.annulledShare)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          <Badge>Fonte: provas oficiais da banca</Badge> Tendência compara as provas mais recentes com as
          anteriores.
        </p>
      </Card>
    </div>
  );
}
