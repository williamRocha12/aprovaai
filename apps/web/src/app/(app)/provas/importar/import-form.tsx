"use client";

import type { ExamDetail, ExamSummary, PastExamDetail } from "@aprovaai/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { PdfReadError, pdfToText } from "@/lib/pdf-text";

const MAX_EXAM_TEXT = 600_000;
const MAX_KEY_TEXT = 50_000;

/** Campo de texto que também aceita um PDF (extraído no navegador). */
function PdfTextField({
  id,
  label,
  hint,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  max: number;
  onChange: (text: string) => void;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      const text = await pdfToText(file);
      if (text.trim().length < 50) setError("Não encontramos texto no PDF (pode ser imagem escaneada).");
      onChange(text.slice(0, max));
    } catch (err) {
      setError(err instanceof PdfReadError ? err.message : "Não foi possível ler este PDF.");
    } finally {
      setReading(false);
    }
  }

  return (
    <Field id={id} label={label} hint={hint}>
      <div className="space-y-2">
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={onFile}
          disabled={reading}
          aria-label={`${label}: arquivo PDF`}
          className="text-sm"
        />
        {reading && <p className="text-sm text-muted-foreground">Lendo o PDF...</p>}
        {error && <Alert variant="warning">{error}</Alert>}
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, max))}
          rows={6}
          className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">{value.length.toLocaleString("pt-BR")} caracteres</p>
      </div>
    </Field>
  );
}

export function PastExamImportForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    boardName: "",
    organization: "",
    positionTitle: "",
    year: String(new Date().getFullYear() - 1),
    area: "",
    sourceUrl: "",
    answerKeyUrl: "",
  });
  const [examText, setExamText] = useState("");
  const [answerKeyText, setAnswerKeyText] = useState("");
  const [referenceExamId, setReferenceExamId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exams = useQuery({
    queryKey: ["catalog-exams-reference"],
    queryFn: () => api.get<{ items: ExamSummary[] }>("/api/catalog/exams?pageSize=50"),
  });
  const reference = useQuery({
    queryKey: ["catalog-exam", referenceExamId],
    queryFn: () => api.get<ExamDetail>(`/api/catalog/exams/${referenceExamId}`),
    enabled: referenceExamId !== "",
  });

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<PastExamDetail>("/api/past-exams", {
        boardName: form.boardName,
        organization: form.organization,
        positionTitle: form.positionTitle,
        year: Number(form.year),
        area: form.area || undefined,
        sourceUrl: form.sourceUrl,
        answerKeyUrl: form.answerKeyUrl || undefined,
        referenceNoticeId: reference.data?.notice?.id ?? null,
        examText,
        answerKeyText,
      });
      router.push(`/provas/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const referenceWithoutNotice = referenceExamId !== "" && reference.data && !reference.data.notice;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="board" label="Banca">
          <Input id="board" required value={form.boardName} onChange={set("boardName")} placeholder="FCC" />
        </Field>
        <Field id="year" label="Ano da prova">
          <Input
            id="year"
            required
            type="number"
            min={1990}
            max={2100}
            value={form.year}
            onChange={set("year")}
          />
        </Field>
        <Field id="organization" label="Órgão">
          <Input id="organization" required value={form.organization} onChange={set("organization")} />
        </Field>
        <Field id="position" label="Cargo">
          <Input id="position" required value={form.positionTitle} onChange={set("positionTitle")} />
        </Field>
        <Field id="area" label="Área (opcional)">
          <Input id="area" value={form.area} onChange={set("area")} placeholder="Judiciária" />
        </Field>
        <Field
          id="reference"
          label="Edital de referência (opcional)"
          hint="Os assuntos desse edital viram as opções na revisão."
        >
          <Select id="reference" value={referenceExamId} onChange={(e) => setReferenceExamId(e.target.value)}>
            <option value="">Sem edital de referência</option>
            {(exams.data?.items ?? []).map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {referenceWithoutNotice && (
        <Alert variant="warning">
          Esse concurso ainda não tem edital com conteúdo programático cadastrado.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="source" label="URL oficial da prova" hint="Página ou PDF da banca/órgão.">
          <Input id="source" required type="url" value={form.sourceUrl} onChange={set("sourceUrl")} />
        </Field>
        <Field id="key-url" label="URL oficial do gabarito (opcional)">
          <Input id="key-url" type="url" value={form.answerKeyUrl} onChange={set("answerKeyUrl")} />
        </Field>
      </div>
      <PdfTextField
        id="exam-text"
        label="Prova"
        hint="Envie o PDF oficial ou cole o texto. Mínimo de 200 caracteres."
        value={examText}
        max={MAX_EXAM_TEXT}
        onChange={setExamText}
      />
      <PdfTextField
        id="key-text"
        label="Gabarito definitivo (opcional)"
        hint="Sem gabarito, as questões entram sem resposta e não podem ir para o banco."
        value={answerKeyText}
        max={MAX_KEY_TEXT}
        onChange={setAnswerKeyText}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="submit" loading={submitting} disabled={examText.trim().length < 200}>
        Importar e processar
      </Button>
    </form>
  );
}
