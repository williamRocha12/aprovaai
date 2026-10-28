"use client";

import type { MockExamResult, MockExamSession } from "@aprovaai/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, LoadingState } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "aprovaai.simulado.";

function loadAnswers(attemptId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PREFIX + attemptId) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveAnswers(attemptId: string, answers: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + attemptId, JSON.stringify(answers));
  } catch {
    // Sem armazenamento local: as respostas ficam só na memória desta aba.
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function MockExamSessionPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const router = useRouter();
  const session = useQuery({
    queryKey: ["mock-session", attemptId],
    queryFn: () => api.get<MockExamSession>(`/api/mock-exam-attempts/${attemptId}/session`),
    retry: false,
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    // Restaura respostas salvas no navegador (recarregar a página não perde o simulado).
    const restored = loadAnswers(attemptId);
    const tick = setTimeout(() => {
      setAnswers(restored);
      setLoaded(true);
    }, 0);
    return () => clearTimeout(tick);
  }, [attemptId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const finish = useMutation({
    mutationFn: () =>
      api.post<MockExamResult>(`/api/mock-exam-attempts/${attemptId}/finish`, {
        answers: (session.data?.questions ?? []).map((q) => ({
          questionId: q.id,
          answer: answers[q.id] ?? null,
        })),
      }),
    onSuccess: () => {
      try {
        localStorage.removeItem(STORAGE_PREFIX + attemptId);
      } catch {
        // ignora
      }
      router.replace(`/simulados/resultado/${attemptId}`);
    },
  });

  if (session.isPending || !loaded) return <LoadingState label="Carregando simulado..." />;
  if (session.isError) return <Alert variant="error">{errorMessage(session.error)}</Alert>;
  const s = session.data;
  const q = s.questions[current];
  const deadline = s.timeLimitMin ? Date.parse(s.startedAt) + s.timeLimitMin * 60_000 : null;
  const remaining = deadline && now ? deadline - now : null;
  const answeredCount = s.questions.filter((x) => answers[x.id]).length;

  function choose(label: string) {
    if (!q) return;
    const next = { ...answers };
    if (next[q.id] === label) delete next[q.id];
    else next[q.id] = label;
    setAnswers(next);
    saveAnswers(attemptId, next);
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2">
        <div>
          <p className="font-semibold">{s.title}</p>
          <p className="text-xs text-muted-foreground">
            {answeredCount} de {s.questions.length} respondidas ·{" "}
            {s.scoringType === "wrong_cancels_right"
              ? `cada errada anula ${s.wrongPenalty} certa (branco não desconta)`
              : "sem penalidade por erro"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span
              className={cn("font-mono text-lg tabular-nums", remaining < 5 * 60_000 && "text-danger")}
              aria-label="Tempo restante"
            >
              {remaining <= 0 ? "Tempo esgotado" : formatClock(remaining)}
            </span>
          )}
          <Button onClick={() => finish.mutate()} loading={finish.isPending}>
            Finalizar
          </Button>
        </div>
      </div>
      {finish.error && <Alert variant="error">{errorMessage(finish.error)}</Alert>}
      {remaining !== null && remaining <= 0 && (
        <Alert variant="warning">
          O tempo acabou. Finalize para ver o resultado (o excesso fica registrado).
        </Alert>
      )}

      <nav aria-label="Questões do simulado" className="flex flex-wrap gap-1">
        {s.questions.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setCurrent(i)}
            aria-current={i === current ? "true" : undefined}
            className={cn(
              "size-9 rounded-md border text-sm",
              i === current ? "border-primary ring-2 ring-primary/30" : "border-border",
              answers[x.id] ? "bg-primary text-primary-foreground" : "bg-surface",
            )}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      {q && (
        <Card className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Questão {current + 1} · {[q.subjectName, q.topicName].filter(Boolean).join(" · ")}
          </p>
          <p className="whitespace-pre-line leading-relaxed">{q.statement}</p>
          <div className="space-y-2" role="radiogroup" aria-label="Alternativas">
            {q.options.map((o) => (
              <button
                key={o.label}
                role="radio"
                aria-checked={answers[q.id] === o.label}
                onClick={() => choose(o.label)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm",
                  answers[q.id] === o.label ? "border-primary bg-muted" : "border-border",
                )}
              >
                <strong>{o.label})</strong> {o.text}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Clique de novo na alternativa marcada para deixar em branco.
          </p>
          <div className="flex justify-between">
            <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={current === s.questions.length - 1}
              onClick={() => setCurrent((c) => c + 1)}
            >
              Próxima
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
