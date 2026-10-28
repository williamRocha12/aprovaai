"use client";

import { PAST_EXAM_STATUS_LABELS, type PastExamSummary } from "@aprovaai/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

export function PastExamList({ isEditor }: { isEditor: boolean }) {
  const searchParams = useSearchParams();
  const [board, setBoard] = useState(() => searchParams.get("board") ?? "");
  const [organization, setOrganization] = useState("");
  const [position, setPosition] = useState("");
  const [year, setYear] = useState("");
  const deferredOrg = useDeferredValue(organization.trim());
  const deferredPosition = useDeferredValue(position.trim());

  const params = new URLSearchParams();
  if (board) params.set("board", board);
  if (deferredOrg) params.set("organization", deferredOrg);
  if (deferredPosition) params.set("position", deferredPosition);
  if (year) params.set("year", year);

  const boards = useQuery({
    queryKey: ["xray-boards"],
    queryFn: () => api.get<{ slug: string; name: string; exams: number }[]>("/api/board-xray/boards"),
  });
  const exams = useQuery({
    queryKey: ["past-exams", params.toString()],
    queryFn: () => api.get<PastExamSummary[]>(`/api/past-exams?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Provas anteriores</h1>
          <p className="text-sm text-muted-foreground">
            Provas oficiais analisadas para o Raio-X da banca. Cada prova traz o link da fonte oficial e o
            crédito à banca.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/raio-x" className={buttonVariants({ size: "sm" })}>
            Raio-X da banca
          </Link>
          {isEditor && (
            <Link href="/provas/importar" className={buttonVariants({ size: "sm", variant: "outline" })}>
              Importar prova
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Select aria-label="Banca" value={board} onChange={(e) => setBoard(e.target.value)}>
          <option value="">Todas as bancas</option>
          {(boards.data ?? []).map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Órgão"
          placeholder="Órgão"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        />
        <Input
          aria-label="Cargo"
          placeholder="Cargo"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <Input
          aria-label="Ano"
          placeholder="Ano"
          type="number"
          min={1990}
          max={2100}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </div>

      {exams.isPending ? (
        <LoadingState label="Carregando provas..." />
      ) : exams.isError ? (
        <Alert variant="error">{errorMessage(exams.error)}</Alert>
      ) : exams.data.length === 0 ? (
        <EmptyState
          title="Nenhuma prova analisada com esses filtros."
          description="As provas entram por importação de editores, sempre a partir da fonte oficial da banca ou do órgão."
        />
      ) : (
        <ul className="space-y-2">
          {exams.data.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div>
                <Link href={`/provas/${e.id}`} className="font-medium text-primary hover:underline">
                  {e.board} {e.year} — {e.organization}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {e.positionTitle}
                  {e.area ? ` · ${e.area}` : ""} · {e.questionCount} questões
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  tone={e.status === "processado" ? "success" : e.status === "erro" ? "danger" : "warning"}
                >
                  {PAST_EXAM_STATUS_LABELS[e.status]}
                </Badge>
                {isEditor && e.pendingReview > 0 && (
                  <Badge tone="warning">{e.pendingReview} para revisar</Badge>
                )}
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Fonte oficial
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
