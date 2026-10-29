import { SITUATION_LABELS, type ExamDetail, type GoalSummary, type MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ExamBadges } from "@/components/exam-badges";
import { OnboardingSteps } from "@/components/onboarding-steps";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDateBr } from "@/lib/plan-ui";
import { serverGet } from "@/lib/server-api";
import { EditorExamForm } from "./editor-exam-form";

export const metadata: Metadata = { title: "Concurso" };

const KIND_LABELS = { basica: "Básica", especifica: "Específica" } as const;
const SPHERE_LABELS = { federal: "Federal", estadual: "Estadual", municipal: "Municipal" } as const;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Página do edital: passo 2 do fluxo (lista → edital → plano), também usada a partir do catálogo. */
export default async function ExamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origem?: string }>;
}) {
  const [{ id }, { origem }] = await Promise.all([params, searchParams]);
  const [exam, me, goals] = await Promise.all([
    serverGet<ExamDetail>(`/api/catalog/exams/${id}`),
    serverGet<MeResponse>("/api/me"),
    serverGet<GoalSummary[]>("/api/goals"),
  ]);
  if (!exam.data) notFound();
  const e = exam.data;
  const isEditor = me.data?.role === "editor" || me.data?.role === "admin";
  const fromList = origem === "lista";
  const studying = (goals.data ?? []).find((g) => g.examId === e.id && g.status !== "encerrado");
  const totalQuestions = e.notice?.subjects.reduce((s, x) => s + (x.questionCount ?? 0), 0) ?? 0;
  const vacancies = e.positions.reduce((sum, p) => sum + (p.vacancies ?? 0), 0);
  const salaries = e.positions.map((p) => p.salary).filter((v): v is number => v !== null);

  const action = studying ? (
    <Link href="/meus-concursos" className={buttonVariants({ variant: "outline" })}>
      Você já estuda este concurso
    </Link>
  ) : e.notice ? (
    <Link href={`/onboarding?concurso=${e.id}`} className={buttonVariants()}>
      Montar plano de estudos
    </Link>
  ) : isEditor && !e.isPrivate ? (
    <Link href={`/concursos/importar?exame=${e.id}`} className={buttonVariants()}>
      Cadastrar conteúdo programático
    </Link>
  ) : null;

  return (
    <div className="space-y-6">
      {fromList && (
        <div className="space-y-3">
          <OnboardingSteps current={2} />
          <Link href={`/onboarding?uf=${e.uf ?? "BR"}`} className="text-sm text-primary hover:underline">
            ← Voltar para a lista de concursos
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{e.title}</h1>
          <p className="text-sm text-muted-foreground">{e.organization}</p>
          <ExamBadges exam={e} />
        </div>
        {action}
      </div>

      {e.isSample && (
        <Alert variant="warning" title="Concurso de exemplo">
          Estrutura ilustrativa para testar o AprovaAI. Pesos e quantidade de questões não vêm de um edital
          oficial.
        </Alert>
      )}

      <Card>
        <h2 className="text-lg font-semibold">Resumo do edital</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Banca">{e.board ?? "Não definida"}</Fact>
          <Fact label="Local">
            {e.uf ? `${e.city ? `${e.city} · ` : ""}${e.uf}` : "Nacional"} · {SPHERE_LABELS[e.sphere]}
          </Fact>
          <Fact label="Situação">
            {SITUATION_LABELS[e.situation]}
            {!e.situationConfirmed && " (não confirmado)"}
          </Fact>
          <Fact label="Vagas">{vacancies > 0 ? vacancies.toLocaleString("pt-BR") : "Não informado"}</Fact>
          <Fact label="Remuneração">
            {salaries.length > 0
              ? salaries.length > 1 && Math.min(...salaries) !== Math.max(...salaries)
                ? `${money.format(Math.min(...salaries))} a ${money.format(Math.max(...salaries))}`
                : money.format(salaries[0] ?? 0)
              : "Não informado"}
          </Fact>
          <Fact label="Inscrições">
            {e.registrationEnd
              ? `até ${formatDateBr(e.registrationEnd)}${e.datesConfirmed ? "" : " (não confirmado)"}`
              : "Não informado"}
          </Fact>
          <Fact label="Prova">
            {e.examDate && e.datesConfirmed ? formatDateBr(e.examDate) : "Data não confirmada"}
          </Fact>
          <Fact label="Edital oficial">
            {e.officialUrl ? (
              <a
                href={e.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Abrir edital
              </a>
            ) : (
              "Não informado"
            )}
          </Fact>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          {e.lastVerifiedAt
            ? `Dados conferidos na fonte oficial em ${new Date(e.lastVerifiedAt).toLocaleDateString("pt-BR")}.`
            : "Dados ainda não conferidos na fonte oficial."}{" "}
          Confira sempre o edital antes de se inscrever.
        </p>
      </Card>

      {e.positions.length > 0 && (
        <Card className="overflow-x-auto">
          <h2 className="text-lg font-semibold">Cargos</h2>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Cargos, vagas e remuneração</caption>
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Cargo</th>
                <th className="py-1 pr-3 font-medium">Vagas</th>
                <th className="py-1 font-medium">Remuneração</th>
              </tr>
            </thead>
            <tbody>
              {e.positions.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1.5 pr-3">{p.title}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{p.vacancies ?? "—"}</td>
                  <td className="py-1.5 tabular-nums">{p.salary !== null ? money.format(p.salary) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isEditor && !e.isPrivate && <EditorExamForm exam={e} />}

      <Card>
        <h2 className="text-lg font-semibold">Conteúdo programático</h2>
        {e.notice ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.notice.title} (versão {e.notice.version}) · pontuação{" "}
              {e.notice.scoringType === "wrong_cancels_right"
                ? `com penalidade (cada errada anula ${e.notice.wrongPenalty} certa)`
                : "padrão (sem penalidade)"}
              {totalQuestions > 0 && ` · ${totalQuestions} questões`}
            </p>
            <div className="mt-4 space-y-4">
              {e.notice.subjects.map((s) => (
                <details key={s.id} className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer font-medium">
                    {s.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · peso {s.weight}
                      {s.questionCount !== null && ` · ${s.questionCount} questões`} · {KIND_LABELS[s.kind]} ·{" "}
                      {s.topics.length} assunto(s)
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {s.topics.map((t) => (
                      <li key={t.id} className={t.parentTopicId ? "pl-4" : ""}>
                        {t.name}{" "}
                        <span className="text-muted-foreground" aria-label={`Relevância ${t.relevance} de 5`}>
                          {"★".repeat(t.relevance)}
                          {"☆".repeat(5 - t.relevance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Conteúdo programático ainda não cadastrado. Assim que um editor cadastrar a partir do edital
            oficial, você poderá montar o plano de estudos para este concurso.
          </p>
        )}
      </Card>

      {action && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-muted-foreground">
            {studying
              ? "Este concurso já está em Meus concursos."
              : e.notice
                ? "Pronto? O próximo passo é dizer quanto tempo você tem e quais disciplinas vai estudar."
                : "Falta o conteúdo programático para montar o plano."}
          </p>
          {action}
        </div>
      )}
    </div>
  );
}
