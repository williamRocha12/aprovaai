"use client";

import { ERROR_TYPE_LABELS, type ReviewItemDto } from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { formatDateBr } from "@/lib/plan-ui";
import { cn } from "@/lib/utils";

type Bucket = ReviewItemDto["bucket"];
const TABS: { bucket: Bucket; label: string; empty: string }[] = [
  { bucket: "hoje", label: "Hoje", empty: "Nada para revisar hoje." },
  { bucket: "atrasada", label: "Atrasadas", empty: "Nenhuma revisão atrasada." },
  { bucket: "futura", label: "Futuras", empty: "Nenhuma revisão agendada." },
  { bucket: "concluida", label: "Dominadas", empty: "Nenhuma questão dominada ainda." },
];
const STAGE_LABELS = ["1 dia", "7 dias", "30 dias"];

export default function ReviewsPage() {
  const [bucket, setBucket] = useState<Bucket>("hoje");
  const reviews = useQuery({
    queryKey: ["reviews"],
    queryFn: () => api.get<{ counts: Record<Bucket, number>; items: ReviewItemDto[] }>("/api/reviews"),
  });
  const items = reviews.data?.items.filter((i) => i.bucket === bucket) ?? [];
  const tab = TABS.find((t) => t.bucket === bucket);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Revisões</h1>
          <p className="text-sm text-muted-foreground">
            Questão errada volta em 1, 7 e 30 dias. Acertou, avança; errou, volta ao início; passou dos 30
            dias, está dominada.
          </p>
        </div>
        <Link href="/caderno-de-erros" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Caderno de erros
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.bucket}
            role="tab"
            aria-selected={bucket === t.bucket}
            onClick={() => setBucket(t.bucket)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              bucket === t.bucket ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {t.label} ({reviews.data?.counts[t.bucket] ?? 0})
          </button>
        ))}
      </div>

      {reviews.isPending ? (
        <LoadingState label="Carregando revisões..." />
      ) : reviews.isError ? (
        <Alert variant="error">{errorMessage(reviews.error)}</Alert>
      ) : items.length === 0 ? (
        <EmptyState
          title={tab?.empty ?? "Nada aqui."}
          description="Questões erradas entram aqui automaticamente."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {item.bucket === "atrasada" && (
                    <Badge tone="danger">Atrasada desde {formatDateBr(item.dueDate)}</Badge>
                  )}
                  {item.bucket === "futura" && <Badge>Em {formatDateBr(item.dueDate)}</Badge>}
                  {item.status === "ativa" && (
                    <Badge tone="neutral">
                      Intervalo: {STAGE_LABELS[item.stage] ?? `estágio ${item.stage + 1}`}
                    </Badge>
                  )}
                  {item.lastErrorType && (
                    <Badge tone="warning">{ERROR_TYPE_LABELS[item.lastErrorType]}</Badge>
                  )}
                  <span className="text-muted-foreground">
                    {[item.subjectName, item.topicName].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm">{item.statementPreview ?? "Questão sem enunciado"}</p>
              </div>
              {(item.bucket === "hoje" || item.bucket === "atrasada") && (
                <Link
                  href={`/questoes/${item.questionId}?revisao=1`}
                  className={buttonVariants({ size: "sm" })}
                >
                  Revisar
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
