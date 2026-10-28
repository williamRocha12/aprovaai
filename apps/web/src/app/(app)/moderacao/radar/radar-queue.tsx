"use client";

import {
  BRAZIL_UFS,
  EXAM_SITUATIONS,
  SITUATION_LABELS,
  type ExamLead,
  type RadarOverview,
} from "@aprovaai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { formatDateBr } from "@/lib/plan-ui";
import { formatDateTime } from "@/lib/utils";

const CONFIDENCE_TONE = { alta: "success", media: "warning", baixa: "danger" } as const;
const SPHERE_LABELS = { federal: "Federal", estadual: "Estadual", municipal: "Municipal" } as const;

function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function SourcesPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [day, setDay] = useState(yesterday);
  const overview = useQuery({ queryKey: ["radar"], queryFn: () => api.get<RadarOverview>("/api/radar") });
  const collect = useMutation({
    mutationFn: () => api.post("/api/radar/collect", { day }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["radar"] }),
  });

  if (overview.isPending) return <LoadingState label="Carregando fontes..." />;
  if (overview.isError) return <Alert variant="error">{errorMessage(overview.error)}</Alert>;
  const o = overview.data;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Fontes</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={o.enabled ? "success" : "danger"}>Radar {o.enabled ? "ligado" : "desligado"}</Badge>
          <Badge tone={o.aiEnabled ? "success" : "neutral"}>
            Extração {o.aiEnabled ? "por IA" : "por regras (IA desligada)"}
          </Badge>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {o.sources.map((s) => (
          <li key={s.source} className="rounded-md border border-border p-3">
            <p className="font-medium">{s.label}</p>
            {s.disabledReason ? (
              <p className="text-muted-foreground">Desativada: {s.disabledReason}</p>
            ) : !s.lastRun ? (
              <p className="text-muted-foreground">Ainda não rodou.</p>
            ) : (
              <p className={s.lastRun.status === "erro" ? "text-danger" : "text-muted-foreground"}>
                Última coleta ({formatDateBr(s.lastRun.day)}):{" "}
                {s.lastRun.status === "erro"
                  ? `erro — ${s.lastRun.errorMessage ?? "sem detalhes"}`
                  : `${s.lastRun.documentsFound} publicação(ões), ${s.lastRun.documentsNew} nova(s)`}
                {s.lastRun.finishedAt && ` · ${formatDateTime(s.lastRun.finishedAt)}`}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        A coleta roda todo dia pelo cron (publicações do dia anterior). Só entram trechos de diários oficiais
        que mencionam abertura de concurso público.
      </p>
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <Field id="collect-day" label="Coletar um dia agora">
            <Input
              id="collect-day"
              type="date"
              value={day}
              max={yesterday()}
              onChange={(e) => setDay(e.target.value)}
              className="w-auto"
            />
          </Field>
          <Button variant="outline" onClick={() => collect.mutate()} loading={collect.isPending}>
            Coletar
          </Button>
        </div>
      )}
      {collect.isError && <Alert variant="error">{errorMessage(collect.error)}</Alert>}
      {collect.isSuccess && (
        <Alert variant="success">Coleta concluída. Os novos itens aparecem na fila abaixo.</Alert>
      )}
    </Card>
  );
}

type Draft = {
  organization: string;
  title: string;
  sphere: ExamLead["sphere"];
  uf: string;
  city: string;
  boardName: string;
  situation: (typeof EXAM_SITUATIONS)[number];
  registrationStart: string;
  registrationEnd: string;
  examDate: string;
  officialUrl: string;
  positions: { title: string; vacancies: string; salary: string }[];
  checked: boolean;
};

function draftOf(lead: ExamLead): Draft {
  return {
    organization: lead.organization,
    title: lead.title,
    sphere: lead.sphere,
    uf: lead.uf ?? "",
    city: lead.city ?? "",
    boardName: lead.boardName ?? "",
    situation: "edital_publicado",
    registrationStart: lead.registrationStart ?? "",
    registrationEnd: lead.registrationEnd ?? "",
    examDate: lead.examDate ?? "",
    officialUrl: lead.noticeUrl ?? lead.source.url,
    positions: lead.positions.map((p) => ({
      title: p.title,
      vacancies: p.vacancies?.toString() ?? "",
      salary: p.salary?.toString() ?? "",
    })),
    checked: false,
  };
}

function LeadCard({ lead }: { lead: ExamLead }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(lead));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["radar-leads"] });
    void queryClient.invalidateQueries({ queryKey: ["radar"] });
  };
  const confirm = useMutation({
    mutationFn: () =>
      api.post<{ examId: string }>(`/api/radar/leads/${lead.id}/confirm`, {
        organization: draft.organization,
        title: draft.title,
        sphere: draft.sphere,
        uf: draft.uf || null,
        city: draft.city || null,
        boardName: draft.boardName || null,
        situation: draft.situation,
        registrationStart: draft.registrationStart || null,
        registrationEnd: draft.registrationEnd || null,
        examDate: draft.examDate || null,
        officialUrl: draft.officialUrl,
        positions: draft.positions
          .filter((p) => p.title.trim())
          .map((p) => ({
            title: p.title.trim(),
            vacancies: p.vacancies ? Number(p.vacancies) : null,
            salary: p.salary ? Number(p.salary.replace(",", ".")) : null,
          })),
        checkedOfficialSource: draft.checked,
      }),
    onSuccess: refresh,
  });
  const discard = useMutation({
    mutationFn: () => api.post(`/api/radar/leads/${lead.id}/discard`),
    onSuccess: refresh,
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setPosition = (i: number, key: "title" | "vacancies" | "salary", value: string) =>
    setDraft((d) => ({ ...d, positions: d.positions.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));

  if (confirm.data) {
    return (
      <Alert variant="success" title={`${draft.title}: publicado no catálogo`}>
        <Link href={`/concursos/${confirm.data.examId}`} className="underline">
          Abrir o concurso e cadastrar o conteúdo programático
        </Link>
      </Alert>
    );
  }

  const id = (name: string) => `${lead.id}-${name}`;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{lead.title}</p>
          <p className="text-sm text-muted-foreground">
            {lead.organization}
            {lead.uf ? ` · ${lead.uf}` : ""} · {SPHERE_LABELS[lead.sphere]}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          <Badge tone={CONFIDENCE_TONE[lead.confidence]}>Confiança {lead.confidence}</Badge>
          <Badge>{lead.extractedBy === "ia" ? "Extraído por IA" : "Extraído por regras"}</Badge>
        </div>
      </div>
      <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic">{lead.evidence}</blockquote>
      <p className="text-xs text-muted-foreground">
        Fonte: {lead.source.title}, {formatDateBr(lead.source.publishedOn)} ·{" "}
        <a
          href={lead.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          abrir publicação oficial
        </a>
      </p>

      {!open ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Conferir e publicar
          </Button>
          <Button size="sm" variant="ghost" loading={discard.isPending} onClick={() => discard.mutate()}>
            Descartar
          </Button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={id("org")} label="Órgão">
              <Input
                id={id("org")}
                value={draft.organization}
                onChange={(e) => set("organization", e.target.value)}
              />
            </Field>
            <Field id={id("title")} label="Título do concurso">
              <Input id={id("title")} value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field id={id("sphere")} label="Esfera">
              <Select
                id={id("sphere")}
                value={draft.sphere}
                onChange={(e) => set("sphere", e.target.value as Draft["sphere"])}
              >
                {Object.entries(SPHERE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={id("uf")} label="UF (vazio = nacional)">
              <Select id={id("uf")} value={draft.uf} onChange={(e) => set("uf", e.target.value)}>
                <option value="">Nacional</option>
                {BRAZIL_UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={id("city")} label="Cidade">
              <Input id={id("city")} value={draft.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field id={id("board")} label="Banca">
              <Input
                id={id("board")}
                value={draft.boardName}
                onChange={(e) => set("boardName", e.target.value)}
              />
            </Field>
            <Field id={id("situation")} label="Situação">
              <Select
                id={id("situation")}
                value={draft.situation}
                onChange={(e) => set("situation", e.target.value as Draft["situation"])}
              >
                {EXAM_SITUATIONS.map((s) => (
                  <option key={s} value={s}>
                    {SITUATION_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={id("url")} label="Link oficial do edital">
              <Input
                id={id("url")}
                type="url"
                value={draft.officialUrl}
                onChange={(e) => set("officialUrl", e.target.value)}
              />
            </Field>
            <Field id={id("reg-start")} label="Inscrições: início">
              <Input
                id={id("reg-start")}
                type="date"
                value={draft.registrationStart}
                onChange={(e) => set("registrationStart", e.target.value)}
              />
            </Field>
            <Field id={id("reg-end")} label="Inscrições: fim">
              <Input
                id={id("reg-end")}
                type="date"
                value={draft.registrationEnd}
                onChange={(e) => set("registrationEnd", e.target.value)}
              />
            </Field>
            <Field id={id("exam-date")} label="Data da prova">
              <Input
                id={id("exam-date")}
                type="date"
                value={draft.examDate}
                onChange={(e) => set("examDate", e.target.value)}
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Cargos</legend>
            {draft.positions.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]">
                <Input
                  aria-label="Cargo"
                  value={p.title}
                  onChange={(e) => setPosition(i, "title", e.target.value)}
                />
                <Input
                  aria-label="Vagas"
                  placeholder="Vagas"
                  inputMode="numeric"
                  value={p.vacancies}
                  onChange={(e) => setPosition(i, "vacancies", e.target.value.replace(/\D/g, ""))}
                />
                <Input
                  aria-label="Salário (R$)"
                  placeholder="Salário R$"
                  inputMode="decimal"
                  value={p.salary}
                  onChange={(e) => setPosition(i, "salary", e.target.value.replace(/[^\d.,]/g, ""))}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft((d) => ({ ...d, positions: d.positions.filter((_, j) => j !== i) }))
                  }
                >
                  Remover
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  positions: [...d.positions, { title: "", vacancies: "", salary: "" }],
                }))
              }
            >
              Adicionar cargo
            </Button>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={draft.checked}
              onChange={(e) => set("checked", e.target.checked)}
            />
            Conferi estes dados no edital/publicação oficial. Datas e situação vão aparecer como confirmadas.
          </label>
          {confirm.isError && <Alert variant="error">{errorMessage(confirm.error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={!draft.checked}>
              Publicar no catálogo
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {discard.isError && <Alert variant="error">{errorMessage(discard.error)}</Alert>}
    </Card>
  );
}

export function RadarQueue({ isAdmin }: { isAdmin: boolean }) {
  const [uf, setUf] = useState("");
  const leads = useQuery({
    queryKey: ["radar-leads", uf],
    queryFn: () => api.get<ExamLead[]>(`/api/radar/leads${uf ? `?uf=${uf}` : ""}`),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Radar de editais</h1>
        <p className="text-sm text-muted-foreground">
          Concursos detectados automaticamente em diários oficiais. Nada aparece para os usuários até você
          conferir na publicação oficial e publicar.
        </p>
      </div>
      <SourcesPanel isAdmin={isAdmin} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Aguardando conferência</h2>
        <Select
          aria-label="Filtrar por UF"
          value={uf}
          onChange={(e) => setUf(e.target.value)}
          className="w-auto"
        >
          <option value="">Todas as UFs</option>
          {BRAZIL_UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </div>
      {leads.isPending ? (
        <LoadingState label="Carregando fila..." />
      ) : leads.isError ? (
        <Alert variant="error">{errorMessage(leads.error)}</Alert>
      ) : leads.data.length === 0 ? (
        <EmptyState
          title="Nenhum concurso aguardando conferência."
          description="Novos itens chegam com a coleta diária das fontes acima."
        />
      ) : (
        <div className="space-y-4">
          {leads.data.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Depois de publicar, cadastre o conteúdo programático em{" "}
        <Link href="/concursos" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Concursos
        </Link>{" "}
        para os usuários poderem montar o plano.
      </p>
    </div>
  );
}
