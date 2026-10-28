"use client";

import type { StudySession } from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { usePlan } from "@/components/plan/use-plan";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { addDays, formatMinutes, localToday } from "@/lib/plan-ui";
import { formatDateTime } from "@/lib/utils";

const SOURCE_LABELS: Record<StudySession["source"], string> = {
  manual: "Manual",
  cronometro: "Cronômetro",
  pomodoro: "Pomodoro",
};

export function SessionsPanel() {
  const queryClient = useQueryClient();
  const plan = usePlan();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<StudySession[]>("/api/sessions"),
  });
  const [date, setDate] = useState(localToday());
  const [minutes, setMinutes] = useState(50);
  const [topicId, setTopicId] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const topics = new Map<string, string>();
  for (const t of plan.data?.cycle?.tasks ?? []) {
    if (t.noticeTopicId && t.topicName) topics.set(t.noticeTopicId, `${t.subjectName} — ${t.topicName}`);
  }

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/sessions", {
        noticeTopicId: topicId || null,
        startedAt: new Date(`${date}T12:00:00`).toISOString(),
        netMinutes: minutes,
        source: "manual",
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setNotes("");
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 960) {
      setFormError("Informe entre 1 e 960 minutos.");
      return;
    }
    setFormError(null);
    create.mutate();
  }

  const weekStart = Date.parse(`${addDays(localToday(), -6)}T00:00:00`);
  const weekTotal = (sessions.data ?? [])
    .filter((s) => Date.parse(s.startedAt) >= weekStart)
    .reduce((sum, s) => sum + s.netMinutes, 0);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Sessões de estudo</h2>
          <span className="text-sm text-muted-foreground">
            Últimos 7 dias: {formatMinutes(weekTotal)} líquidos
          </span>
        </div>
        <div className="mt-4">
          {sessions.isPending ? (
            <LoadingState />
          ) : sessions.isError ? (
            <Alert variant="error">{errorMessage(sessions.error)}</Alert>
          ) : sessions.data.length === 0 ? (
            <EmptyState
              title="Nenhuma sessão registrada."
              description="Use o cronômetro em “Agora” ou registre manualmente ao lado."
            />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {sessions.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">
                      {formatMinutes(s.netMinutes)} · {s.topicName ?? "Sem assunto"}
                    </p>
                    <p className="text-muted-foreground">
                      {formatDateTime(s.startedAt)} · {SOURCE_LABELS[s.source]}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(s.id)}
                    loading={remove.isPending && remove.variables === s.id}
                  >
                    Excluir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Registrar sessão</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          {(formError || create.error) && (
            <Alert variant="error">{formError ?? errorMessage(create.error)}</Alert>
          )}
          {create.isSuccess && <Alert variant="success">Sessão registrada.</Alert>}
          <Field id="session-date" label="Data">
            <Input
              {...fieldAria("session-date")}
              type="date"
              value={date}
              max={localToday()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field id="session-minutes" label="Minutos líquidos">
            <Input
              {...fieldAria("session-minutes")}
              type="number"
              min={1}
              max={960}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
          <Field id="session-topic" label="Assunto (opcional)">
            <Select
              {...fieldAria("session-topic")}
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
            >
              <option value="">Sem assunto</option>
              {[...topics].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="session-notes" label="Anotação (opcional)">
            <Input
              {...fieldAria("session-notes")}
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={create.isPending} className="w-full">
            Registrar
          </Button>
        </form>
      </Card>
    </section>
  );
}
