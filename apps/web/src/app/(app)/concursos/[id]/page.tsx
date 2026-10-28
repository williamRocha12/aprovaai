import type { ExamDetail, MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamBadges } from "@/components/exam-badges";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { formatDateBr } from "@/lib/plan-ui";
import { serverGet } from "@/lib/server-api";
import { EditorExamForm } from "./editor-exam-form";

export const metadata: Metadata = { title: "Concurso" };

const KIND_LABELS = { basica: "Básica", especifica: "Específica" } as const;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [exam, me] = await Promise.all([
    serverGet<ExamDetail>(`/api/catalog/exams/${id}`),
    serverGet<MeResponse>("/api/me"),
  ]);
  if (!exam.data) notFound();
  const e = exam.data;
  const isEditor = me.data?.role === "editor" || me.data?.role === "admin";
  const totalQuestions = e.notice?.subjects.reduce((s, x) => s + (x.questionCount ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{e.title}</h1>
          <p className="text-sm text-muted-foreground">
            {e.organization}
            {e.board ? ` · Banca ${e.board}` : " · Banca não definida"}
            {e.uf ? ` · ${e.uf}` : ""}
          </p>
          <ExamBadges exam={e} />
        </div>
        {e.notice ? (
          <Link href={`/onboarding?concurso=${e.id}`} className={buttonVariants()}>
            Estudar para este concurso
          </Link>
        ) : (
          isEditor &&
          !e.isPrivate && (
            <Link href={`/concursos/importar?exame=${e.id}`} className={buttonVariants()}>
              Cadastrar conteúdo programático
            </Link>
          )
        )}
      </div>

      {e.isSample && (
        <Alert variant="warning" title="Concurso de exemplo">
          Estrutura ilustrativa para testar o AprovaAI. Pesos e quantidade de questões não vêm de um edital
          oficial.
        </Alert>
      )}

      <Card>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Fonte oficial</dt>
            <dd>
              {e.officialUrl ? (
                <a
                  href={e.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Abrir
                </a>
              ) : (
                "Não informada"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Última verificação</dt>
            <dd>
              {e.lastVerifiedAt ? new Date(e.lastVerifiedAt).toLocaleDateString("pt-BR") : "Nunca verificado"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Inscrições</dt>
            <dd>
              {e.registrationEnd
                ? `até ${formatDateBr(e.registrationEnd)}${e.datesConfirmed ? "" : " (não confirmado)"}`
                : "Não informado"}
            </dd>
          </div>
        </dl>
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
        <h2 className="text-lg font-semibold">Edital verticalizado</h2>
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
                <details key={s.id} className="rounded-md border border-border p-3" open>
                  <summary className="cursor-pointer font-medium">
                    {s.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · peso {s.weight}
                      {s.questionCount !== null && ` · ${s.questionCount} questões`} · {KIND_LABELS[s.kind]}
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
    </div>
  );
}
