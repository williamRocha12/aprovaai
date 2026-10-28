"use client";

import {
  BRAZIL_UFS,
  SITUATION_LABELS,
  type Cycle,
  type ExamDetail,
  type ExamSummary,
  type Goal,
  type GoalInput,
  type WeeklyAvailability,
} from "@aprovaai/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { useGoals } from "@/components/goal-context";
import { api, errorMessage } from "@/lib/api";
import { WEEKDAY_LABELS, formatDateBr, formatMinutes } from "@/lib/plan-ui";
import { cn } from "@/lib/utils";

const DEFAULT_WEEK: WeeklyAvailability = {
  "0": 0,
  "1": 120,
  "2": 120,
  "3": 120,
  "4": 120,
  "5": 120,
  "6": 240,
};
const BLOCK_OPTIONS = [25, 30, 45, 50, 60, 90, 120];
const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i * 30); // 0 a 12h, de 30 em 30 min
const DAY_ORDER = ["1", "2", "3", "4", "5", "6", "0"] as const;
const STEPS = ["Concurso", "Horas", "Disciplinas", "Prova"];

interface SubjectChoice {
  noticeSubjectId: string;
  name: string;
  active: boolean;
  selfAssessment: number | null;
}

interface Props {
  existing: Goal | null;
  preselectedExamId: string | null;
  defaultAvailability: WeeklyAvailability | null;
}

export function OnboardingWizard({ existing, preselectedExamId, defaultAvailability }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { goals, selectGoal } = useGoals();
  // Edição: o concurso é fixo (outro edital = outro concurso); começa nas horas.
  const [step, setStep] = useState(existing ? 1 : 0);
  // Se a criação gerou o concurso mas o ciclo teve pendências, os próximos envios editam esse concurso.
  const [goalId, setGoalId] = useState<string | null>(existing?.id ?? null);
  const [examId, setExamId] = useState<string | null>(preselectedExamId ?? existing?.examId ?? null);
  const [positionId, setPositionId] = useState<string | null>(existing?.positionId ?? null);
  const [week, setWeek] = useState<WeeklyAvailability>(
    existing?.weeklyAvailability ?? defaultAvailability ?? DEFAULT_WEEK,
  );
  const [blockMinutes, setBlockMinutes] = useState(existing?.blockMinutes ?? 50);
  const [subjects, setSubjects] = useState<SubjectChoice[] | null>(
    existing && existing.examId === (preselectedExamId ?? existing.examId) ? existing.subjects : null,
  );
  const [examDate, setExamDate] = useState(existing?.targetExamDate ?? "");
  const [search, setSearch] = useState("");
  const [uf, setUf] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [includeNational, setIncludeNational] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const catalogParams = new URLSearchParams({ pageSize: "50" });
  if (search) catalogParams.set("search", search);
  if (onlyOpen) catalogParams.set("open", "true");
  if (uf) {
    catalogParams.set("uf", uf);
    if (includeNational) catalogParams.set("includeNational", "true");
  }
  const exams = useQuery({
    queryKey: ["catalog", catalogParams.toString()],
    queryFn: () => api.get<{ items: ExamSummary[] }>(`/api/catalog/exams?${catalogParams.toString()}`),
  });
  const detail = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get<ExamDetail>(`/api/catalog/exams/${examId}`),
    enabled: Boolean(examId),
  });

  const exam = detail.data;
  const notice = exam?.notice ?? null;
  const subjectList: SubjectChoice[] =
    subjects ??
    (notice?.subjects ?? []).map((s) => ({
      noticeSubjectId: s.id,
      name: s.name,
      active: true,
      selfAssessment: null,
    }));
  const totalWeek = Object.values(week).reduce((a, b) => a + b, 0);

  /** Ao clicar no concurso, carrega o edital e já segue para a configuração do plano. */
  async function chooseExam(id: string) {
    if (id !== examId) {
      setExamId(id);
      setSubjects(null);
      setPositionId(null);
    }
    try {
      const chosen = await queryClient.fetchQuery({
        queryKey: ["exam", id],
        queryFn: () => api.get<ExamDetail>(`/api/catalog/exams/${id}`),
      });
      if (chosen.notice && chosen.positions.length <= 1) setStep(1);
    } catch {
      // O erro aparece pela query de detalhe logo abaixo da lista.
    }
  }

  /** Concursos que o usuário já estuda (ativos ou pausados) não podem ser adicionados de novo. */
  const studying = new Set(goals.filter((g) => g.status !== "encerrado").map((g) => g.examId));

  function updateSubject(id: string, patch: Partial<SubjectChoice>) {
    setSubjects(subjectList.map((s) => (s.noticeSubjectId === id ? { ...s, ...patch } : s)));
  }

  function canAdvance(): string | null {
    if (step === 0) {
      if (!examId) return "Clique em um concurso da lista para selecioná-lo.";
      if (!exam) return detail.isError ? "Não foi possível carregar o edital." : "Carregando o edital...";
      if (!notice) return "Esse concurso ainda não tem edital com conteúdo programático.";
    }
    if (step === 1 && totalWeek === 0) return "Informe pelo menos algumas horas na semana.";
    if (step === 2 && !subjectList.some((s) => s.active)) return "Ative ao menos uma disciplina.";
    return null;
  }

  async function submit() {
    if (!exam || !notice) return;
    setSubmitting(true);
    setError(null);
    setIssues([]);
    const body: GoalInput = {
      examId: exam.id,
      noticeId: notice.id,
      positionId: positionId ?? exam.positions[0]?.id ?? null,
      targetExamDate: examDate || null,
      weeklyAvailability: week,
      blockMinutes,
      subjects: subjectList.map(({ noticeSubjectId, active, selfAssessment }) => ({
        noticeSubjectId,
        active,
        selfAssessment,
      })),
      priorityWeights: existing?.priorityWeights ?? null,
      reviewIntervals: existing?.reviewIntervals,
    };
    try {
      type Result = { goalId?: string; cycle: Cycle | null; issues: { message: string }[] };
      const result = goalId
        ? await api.request<Result>("PUT", `/api/goals/${goalId}`, body)
        : await api.post<Result>("/api/goals", body);
      const savedId = goalId ?? result.goalId ?? null;
      if (savedId && savedId !== goalId) setGoalId(savedId);
      if (result.issues.length > 0) {
        setIssues(result.issues.map((i) => i.message));
        return;
      }
      if (savedId) selectGoal(savedId);
      router.push("/agora");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const blocker = canAdvance();

  return (
    <Card>
      <ol className="mb-6 grid grid-cols-4 gap-2 text-xs" aria-label="Passos">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "rounded-md border px-2 py-1.5 text-center",
              i === step
                ? "border-primary bg-primary text-primary-foreground"
                : i < step
                  ? "border-success text-success"
                  : "border-border text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Qual concurso você vai prestar?</h2>
          <Input
            placeholder="Buscar por órgão ou concurso"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar concurso"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Select
              aria-label="Estado"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              className="w-auto min-w-44"
            >
              <option value="">Todos os estados</option>
              {BRAZIL_UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
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
          </div>
          <p className="text-xs text-muted-foreground">
            A lista mostra os concursos cadastrados no catálogo, conferidos a partir de fontes oficiais. “Em
            aberto” inclui previstos, autorizados e com edital publicado; só os encerrados ficam de fora.
          </p>
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
            <ul className="max-h-80 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Concursos">
              {exams.data.items.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={examId === e.id}
                    disabled={studying.has(e.id)}
                    onClick={() => void chooseExam(e.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
                      examId === e.id ? "border-primary bg-muted ring-2 ring-primary/30" : "border-border",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                        examId === e.id ? "border-primary" : "border-muted-foreground",
                      )}
                    >
                      {examId === e.id && <span className="size-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{e.title}</span>{" "}
                      {e.isSample && <Badge tone="warning">Exemplo</Badge>}{" "}
                      {e.isPrivate && <Badge>Privado</Badge>}{" "}
                      {studying.has(e.id) && <Badge tone="success">Você já estuda</Badge>}
                      <span className="block text-muted-foreground">
                        {e.organization}
                        {e.board ? ` · ${e.board}` : ""} · {SITUATION_LABELS[e.situation]}
                        {!e.situationConfirmed && " (não confirmado)"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {detail.isFetching && <LoadingState label="Carregando edital..." />}
          {detail.isError && <Alert variant="error">{errorMessage(detail.error)}</Alert>}
          {exam && exam.positions.length > 1 && (
            <Field id="position" label="Cargo">
              <Select
                {...fieldAria("position")}
                value={positionId ?? ""}
                onChange={(e) => setPositionId(e.target.value || null)}
              >
                <option value="">Selecione</option>
                {exam.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {exam && !notice && <Alert variant="warning">Este concurso ainda não tem edital cadastrado.</Alert>}
          <p className="text-sm text-muted-foreground">
            Não achou o seu?{" "}
            <Link href="/concursos/importar" className="text-primary underline">
              Cadastre a partir do edital
            </Link>
            .
          </p>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Quanto tempo você tem para estudar?</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {DAY_ORDER.map((day) => (
              <Field key={day} id={`day-${day}`} label={WEEKDAY_LABELS[Number(day)] ?? day}>
                <Select
                  {...fieldAria(`day-${day}`)}
                  value={week[day]}
                  onChange={(e) => setWeek({ ...week, [day]: Number(e.target.value) })}
                >
                  {HOUR_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Não estudo" : formatMinutes(m)}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <Field
            id="block"
            label="Duração preferida de cada bloco"
            hint="Blocos menores encaixam melhor em dias corridos."
          >
            <Select
              {...fieldAria("block", undefined, true)}
              value={blockMinutes}
              onChange={(e) => setBlockMinutes(Number(e.target.value))}
            >
              {BLOCK_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} minutos
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-sm">
            Total na semana: <strong>{formatMinutes(totalWeek)}</strong>
          </p>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Disciplinas e autoavaliação</h2>
          <p className="text-sm text-muted-foreground">
            Desative o que não vai estudar agora. A autoavaliação (0–100%) só é usada até você responder 10
            questões do assunto.
          </p>
          <ul className="space-y-3">
            {subjectList.map((s) => (
              <li
                key={s.noticeSubjectId}
                className={cn("rounded-md border border-border p-3", !s.active && "opacity-60")}
              >
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={s.active}
                    onChange={(e) => updateSubject(s.noticeSubjectId, { active: e.target.checked })}
                  />
                  {s.name}
                </label>
                {s.active && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <label htmlFor={`sa-${s.noticeSubjectId}`} className="text-muted-foreground">
                      Quanto você domina:
                    </label>
                    <input
                      id={`sa-${s.noticeSubjectId}`}
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={s.selfAssessment ?? 50}
                      onChange={(e) =>
                        updateSubject(s.noticeSubjectId, { selfAssessment: Number(e.target.value) })
                      }
                      className="w-40 accent-[var(--color-primary)]"
                    />
                    <span className="w-24">
                      {s.selfAssessment === null ? "não informado" : `${s.selfAssessment}%`}
                    </span>
                    {s.selfAssessment !== null && (
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => updateSubject(s.noticeSubjectId, { selfAssessment: null })}
                      >
                        não sei
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {step === 3 && exam && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Data da prova</h2>
          <p className="text-sm text-muted-foreground">
            Data no catálogo:{" "}
            <strong>{exam.datesConfirmed ? formatDateBr(exam.examDate) : "não confirmada"}</strong>. A data
            define a fase do plano (perto da prova, mais revisão e simulados). Sem data, você fica na fase
            base.
          </p>
          <Field id="exam-date" label="Data da prova (opcional)">
            <Input
              {...fieldAria("exam-date")}
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </Field>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p>
              <strong>{exam.title}</strong>
            </p>
            <p>
              {formatMinutes(totalWeek)} por semana · blocos de {blockMinutes} min ·{" "}
              {subjectList.filter((s) => s.active).length} disciplina(s)
            </p>
          </div>
          {issues.length > 0 && (
            <Alert variant="warning" title="Ajuste antes de continuar">
              <ul className="list-disc pl-4">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Alert>
          )}
          {error && <Alert variant="error">{error}</Alert>}
        </section>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === (existing ? 1 : 0)}
        >
          Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <div className="flex items-center gap-3">
            {blocker && <span className="text-xs text-muted-foreground">{blocker}</span>}
            <Button onClick={() => setStep((s) => s + 1)} disabled={Boolean(blocker)}>
              Continuar
            </Button>
          </div>
        ) : (
          <Button onClick={submit} loading={submitting}>
            {existing ? "Salvar e recalcular" : "Gerar meu ciclo"}
          </Button>
        )}
      </div>
    </Card>
  );
}
