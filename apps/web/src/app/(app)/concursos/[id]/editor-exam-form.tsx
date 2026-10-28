"use client";

import { CONTENT_STATUSES, EXAM_SITUATIONS, SITUATION_LABELS, type ExamDetail } from "@aprovaai/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  validado: "Validado (público)",
} as const;

/** Edição de situação, datas e publicação pelo editor (auditada no backend). */
export function EditorExamForm({ exam }: { exam: ExamDetail }) {
  const router = useRouter();
  const [situation, setSituation] = useState(exam.situation);
  const [situationConfirmed, setSituationConfirmed] = useState(exam.situationConfirmed);
  const [examDate, setExamDate] = useState(exam.examDate ?? "");
  const [datesConfirmed, setDatesConfirmed] = useState(exam.datesConfirmed);
  const [contentStatus, setContentStatus] = useState(exam.contentStatus);
  const [officialUrl, setOfficialUrl] = useState(exam.officialUrl ?? "");
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((situationConfirmed || datesConfirmed) && !officialUrl) {
      setStatus({ kind: "error", text: "Para marcar como confirmado, informe a URL da fonte oficial." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await api.patch(`/api/catalog/exams/${exam.id}`, {
        situation,
        situationConfirmed,
        examDate: examDate || null,
        datesConfirmed,
        contentStatus,
        officialUrl: officialUrl || null,
      });
      setStatus({ kind: "success", text: "Concurso atualizado." });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Edição do catálogo (editor)</h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        {status && (
          <div className="sm:col-span-2">
            <Alert variant={status.kind}>{status.text}</Alert>
          </div>
        )}
        <Field id="ed-situation" label="Situação">
          <Select
            {...fieldAria("ed-situation")}
            value={situation}
            onChange={(e) => setSituation(e.target.value as typeof situation)}
          >
            {EXAM_SITUATIONS.map((s) => (
              <option key={s} value={s}>
                {SITUATION_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ed-date" label="Data da prova">
          <Input
            {...fieldAria("ed-date")}
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={situationConfirmed}
            onChange={(e) => setSituationConfirmed(e.target.checked)}
          />
          Situação confirmada por fonte oficial
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={datesConfirmed}
            onChange={(e) => setDatesConfirmed(e.target.checked)}
          />
          Datas confirmadas por fonte oficial
        </label>
        <Field id="ed-url" label="URL da fonte oficial">
          <Input
            {...fieldAria("ed-url")}
            type="url"
            value={officialUrl}
            onChange={(e) => setOfficialUrl(e.target.value)}
          />
        </Field>
        <Field id="ed-status" label="Publicação">
          <Select
            {...fieldAria("ed-status")}
            value={contentStatus}
            onChange={(e) => setContentStatus(e.target.value as typeof contentStatus)}
          >
            {CONTENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}
