"use client";

import type { MockExamSession, MockExamSummary } from "@aprovaai/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { subjectsOf, useGoalTopics } from "@/components/questions/use-goal-topics";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { useSelectedGoalId } from "@/components/goal-context";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

export default function MockExamsPage() {
  const router = useRouter();
  const topics = useGoalTopics();
  const exams = useQuery({
    queryKey: ["mock-exams"],
    queryFn: () => api.get<MockExamSummary[]>("/api/mock-exams"),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [timeLimit, setTimeLimit] = useState("60");
  const [title, setTitle] = useState("");

  const start = useMutation({
    mutationFn: (id: string) => api.post<MockExamSession>(`/api/mock-exams/${id}/start`),
    onSuccess: (session) => router.push(`/simulados/sessao/${session.attemptId}`),
  });
  const goalId = useSelectedGoalId();
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/api/mock-exams", {
        title: title.trim() || undefined,
        subjectIds: selected,
        questionCount: count,
        timeLimitMin: timeLimit ? Number(timeLimit) : null,
        preferUnanswered: true,
        goalId: goalId ?? undefined,
      }),
    onSuccess: (exam) => start.mutate(exam.id),
  });

  const subjects = subjectsOf(topics.data ?? []);
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Simulados</h1>
        <p className="text-sm text-muted-foreground">
          Montados com a distribuição de questões do seu edital e corrigidos pela regra da banca. Erros vão
          para o caderno.
        </p>
      </div>

      {exams.isError ? (
        <Alert variant="error">{errorMessage(exams.error)}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            <h2 className="font-semibold">Meus simulados</h2>
            {exams.isPending ? (
              <LoadingState />
            ) : exams.data.length === 0 ? (
              <EmptyState title="Nenhum simulado ainda." description="Monte o primeiro ao lado." />
            ) : (
              <ul className="mt-3 divide-y divide-border text-sm">
                {exams.data.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{e.title}</p>
                      <p className="text-muted-foreground">
                        {e.questionCount} questões ·{" "}
                        {e.timeLimitMin ? `${e.timeLimitMin} min` : "sem tempo-limite"} ·{" "}
                        {e.scoringType === "wrong_cancels_right" ? "errada anula certa" : "sem penalidade"} ·{" "}
                        {formatDateTime(e.createdAt)}
                      </p>
                    </div>
                    {e.lastAttempt?.finished ? (
                      <div className="flex items-center gap-2">
                        <Badge tone="success">
                          Nota {e.lastAttempt.score} / {e.lastAttempt.maxScore}
                        </Badge>
                        <Link
                          href={`/simulados/resultado/${e.lastAttempt.id}`}
                          className={buttonVariants({ size: "sm", variant: "outline" })}
                        >
                          Resultado
                        </Link>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => start.mutate(e.id)}
                        loading={start.isPending && start.variables === e.id}
                      >
                        {e.lastAttempt ? "Continuar" : "Começar"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">Montar simulado</h2>
            <form onSubmit={submit} className="mt-3 space-y-3">
              {(create.error || start.error) && (
                <Alert variant="error">{errorMessage(create.error ?? start.error)}</Alert>
              )}
              <Field id="me-title" label="Nome (opcional)">
                <Input
                  {...fieldAria("me-title")}
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field id="me-count" label="Número de questões">
                <Input
                  {...fieldAria("me-count")}
                  type="number"
                  min={5}
                  max={120}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </Field>
              <Field id="me-time" label="Tempo-limite">
                <Select
                  {...fieldAria("me-time")}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                >
                  <option value="">Sem tempo-limite</option>
                  {[15, 30, 60, 90, 120, 180, 240, 300].map((m) => (
                    <option key={m} value={m}>
                      {m} minutos
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset>
                <legend className="text-sm font-medium">Disciplinas</legend>
                <p className="text-xs text-muted-foreground">
                  Nenhuma marcada = todas do seu plano, no peso do edital.
                </p>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {subjects.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button type="submit" className="w-full" loading={create.isPending || start.isPending}>
                Montar e começar
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
