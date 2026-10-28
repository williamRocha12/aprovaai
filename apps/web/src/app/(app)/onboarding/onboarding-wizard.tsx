"use client";

import {
  type Cycle,
  type ExamDetail,
  type Goal,
  type GoalInput,
  type WeeklyAvailability,
} from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card, LoadingState } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { ExamFacts } from "@/components/exam-facts";
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
const STEPS = ["Horas", "Disciplinas", "Prova"];

interface SubjectChoice {
  noticeSubjectId: string;
  name: string;
  active: boolean;
  selfAssessment: number | null;
}

interface Props {
  /** Concurso escolhido na lista (passo anterior) ou o do plano em edição. */
  examId: string;
  existing: Goal | null;
  defaultAvailability: WeeklyAvailability | null;
}

/** Configuração do plano de um concurso já escolhido: horas, disciplinas e data da prova. */
export function OnboardingWizard({ examId, existing, defaultAvailability }: Props) {
  const router = useRouter();
  const { selectGoal } = useGoals();
  const [step, setStep] = useState(0);
  // Se a criação gerou o concurso mas o ciclo teve pendências, os próximos envios editam esse concurso.
  const [goalId, setGoalId] = useState<string | null>(existing?.id ?? null);
  const [positionId, setPositionId] = useState<string | null>(existing?.positionId ?? null);
  const [week, setWeek] = useState<WeeklyAvailability>(
    existing?.weeklyAvailability ?? defaultAvailability ?? DEFAULT_WEEK,
  );
  const [blockMinutes, setBlockMinutes] = useState(existing?.blockMinutes ?? 50);
  const [subjects, setSubjects] = useState<SubjectChoice[] | null>(existing?.subjects ?? null);
  const [examDate, setExamDate] = useState(existing?.targetExamDate ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const detail = useQuery({
    queryKey: ["exam", examId],
    queryFn: () => api.get<ExamDetail>(`/api/catalog/exams/${examId}`),
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

  function updateSubject(id: string, patch: Partial<SubjectChoice>) {
    setSubjects(subjectList.map((s) => (s.noticeSubjectId === id ? { ...s, ...patch } : s)));
  }

  function canAdvance(): string | null {
    if (!exam || !notice) return "Carregando o edital...";
    if (exam.positions.length > 1 && !positionId) return "Escolha o cargo.";
    if (step === 0 && totalWeek === 0) return "Informe pelo menos algumas horas na semana.";
    if (step === 1 && !subjectList.some((s) => s.active)) return "Ative ao menos uma disciplina.";
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

  if (detail.isPending) return <LoadingState label="Carregando o concurso..." />;
  if (detail.isError) return <Alert variant="error">{errorMessage(detail.error)}</Alert>;
  if (!notice) {
    return (
      <Alert variant="warning" title="Ainda não dá para montar o plano deste concurso">
        O conteúdo programático ainda não foi cadastrado.{" "}
        <Link href="/onboarding" className="underline">
          Escolher outro concurso
        </Link>
      </Alert>
    );
  }

  return (
    <Card>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-md bg-muted p-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Concurso escolhido</p>
          <p className="font-semibold">{exam?.title}</p>
          <p className="text-sm text-muted-foreground">
            {exam?.organization}
            {exam?.board ? ` · ${exam.board}` : ""}
            {exam?.uf ? ` · ${exam.uf}` : ""}
          </p>
          {exam && <ExamFacts exam={exam} />}
        </div>
        {!existing && (
          <Link href={`/concursos/${examId}?origem=lista`} className="text-sm text-primary underline">
            Ver edital
          </Link>
        )}
      </div>
      {exam && exam.positions.length > 1 && (
        <div className="mb-6">
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
        </div>
      )}
      <ol className="mb-6 grid grid-cols-3 gap-2 text-xs" aria-label="Passos">
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

      {step === 1 && (
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

      {step === 2 && exam && (
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
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
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
