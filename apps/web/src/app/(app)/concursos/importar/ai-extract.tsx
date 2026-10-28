"use client";

import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";

const MAX_PDF_BYTES = 40 * 1024 * 1024;
const MAX_TEXT = 400_000;

interface Proposal {
  proposal: unknown;
  warnings: string[];
  issues: string[];
}

/** Lê o PDF NO NAVEGADOR (o arquivo não é enviado): só o texto vai para a IA. */
async function pdfToText(file: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export function AiExtract({ onProposal }: { onProposal: (json: string) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Proposal | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Envie um arquivo PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("PDF grande demais (máximo 40 MB).");
      return;
    }
    setReading(true);
    try {
      const extracted = await pdfToText(file);
      if (extracted.trim().length < 200) {
        setError(
          "Não encontramos texto no PDF (pode ser imagem escaneada). Cole o conteúdo programático abaixo.",
        );
      }
      setText(extracted.slice(0, MAX_TEXT));
      setFileName(file.name);
    } catch {
      setError("Não foi possível ler este PDF. Cole o texto do conteúdo programático abaixo.");
    } finally {
      setReading(false);
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<Proposal>("/api/ai/notice-extract", { text });
      setResult(data);
      onProposal(JSON.stringify(data.proposal, null, 2));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-muted/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Gerar proposta com IA</p>
        <Badge tone="warning">Gerado por IA: revise antes de salvar</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        O PDF é lido no seu navegador e só o texto é enviado. A IA propõe disciplinas, assuntos e pesos; nada
        é salvo até você revisar e clicar em Cadastrar. Instruções escritas dentro do documento são ignoradas.
      </p>
      <label className="block text-sm">
        <span className="sr-only">Arquivo do edital (PDF)</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={onFile}
          disabled={reading || loading}
          className="text-sm"
        />
      </label>
      {reading && <p className="text-sm text-muted-foreground">Lendo o PDF...</p>}
      {fileName && !reading && (
        <p className="text-xs text-muted-foreground">
          {fileName}: {text.length.toLocaleString("pt-BR")} caracteres extraídos.
        </p>
      )}
      <label htmlFor="ai-text" className="block text-sm font-medium">
        Texto do edital (de preferência só o conteúdo programático)
      </label>
      <textarea
        id="ai-text"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
        rows={6}
        className="w-full rounded-md border border-border bg-surface p-2 font-mono text-xs"
      />
      {error && <Alert variant="error">{error}</Alert>}
      {result && (
        <Alert
          variant={result.issues.length ? "warning" : "success"}
          title="Proposta carregada no campo JSON abaixo"
        >
          {result.warnings.length > 0 && (
            <ul className="list-disc pl-4">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {result.issues.length > 0 && (
            <p className="mt-1">Corrija antes de cadastrar: {result.issues.join("; ")}</p>
          )}
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={generate}
        loading={loading}
        disabled={text.trim().length < 200}
      >
        Gerar proposta
      </Button>
    </div>
  );
}
