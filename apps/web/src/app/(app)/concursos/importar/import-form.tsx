"use client";

import { noticeImportSchema } from "@aprovaai/shared";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { usePublicConfig } from "@/components/use-public-config";
import { api, errorMessage } from "@/lib/api";
import { AiExtract } from "./ai-extract";

const TEMPLATE = {
  exam: {
    title: "Prefeitura de Exemplo — Agente Administrativo",
    organization: { name: "Prefeitura Municipal de Exemplo", sphere: "municipal", uf: "SC", city: "Exemplo" },
    board: { name: "FGV", slug: "fgv" },
    sphere: "municipal",
    uf: "SC",
    situation: "edital_publicado",
    officialUrl: "https://www.exemplo.sc.gov.br/edital.pdf",
  },
  position: { title: "Agente Administrativo", educationLevel: "medio" },
  notice: { title: "Edital nº 1/2026", scoringType: "standard" },
  subjects: [
    {
      name: "Língua Portuguesa",
      weight: 1,
      questionCount: 10,
      kind: "basica",
      topics: [
        { name: "Interpretação de textos", relevance: 5 },
        { name: "Crase", relevance: 3 },
      ],
    },
  ],
};

/** Com `targetExam`, o edital é adicionado a um concurso do catálogo que ainda não tem conteúdo programático. */
export function ImportForm({
  isEditor,
  targetExam = null,
}: {
  isEditor: boolean;
  targetExam?: { id: string; title: string } | null;
}) {
  const config = usePublicConfig();
  const [text, setText] = useState("");
  const [toCatalog, setToCatalog] = useState(isEditor);
  const [publish, setPublish] = useState(targetExam !== null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    examId: string;
    subjects: number;
    topics: number;
    target: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setIssues([]);
    setError(null);
    setResult(null);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      setError("O texto não é um JSON válido.");
      return;
    }
    const parsed = noticeImportSchema.safeParse(json);
    if (!parsed.success) {
      setIssues(parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`));
      return;
    }
    setLoading(true);
    try {
      setResult(
        await api.post("/api/catalog/import", {
          data: parsed.data,
          target: toCatalog || targetExam ? "catalog" : "private",
          publish: (toCatalog || targetExam !== null) && publish,
          ...(targetExam ? { examId: targetExam.id } : {}),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4">
      {config.data?.aiEnabled && <AiExtract onProposal={setText} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="import-json" className="font-medium">
          Edital verticalizado (JSON)
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setText(JSON.stringify(TEMPLATE, null, 2))}
        >
          Usar modelo
        </Button>
      </div>
      <textarea
        id="import-json"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={18}
        spellCheck={false}
        className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs"
        placeholder='{ "exam": { ... }, "notice": { ... }, "subjects": [ ... ] }'
      />
      <p className="text-xs text-muted-foreground">
        Cada disciplina tem peso, nº de questões, tipo (basica/especifica) e assuntos com relevância de 1 a 5
        (subassuntos em &quot;subtopics&quot;). Assuntos com o mesmo nome reaproveitam a taxonomia do
        catálogo.
      </p>
      {targetExam && (
        <Alert variant="info" title={`Completando: ${targetExam.title}`}>
          Órgão, cargos e datas já foram confirmados. Aqui entram só o edital e o conteúdo programático; os
          campos de &quot;exam&quot; e &quot;position&quot; do JSON são ignorados.
        </Alert>
      )}
      {isEditor && !targetExam && (
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={toCatalog}
              onChange={(e) => setToCatalog(e.target.checked)}
            />
            Publicar no catálogo (em vez de privado)
          </label>
          {toCatalog && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
              />
              Já validado (visível para todos); senão fica como rascunho
            </label>
          )}
        </div>
      )}
      {issues.length > 0 && (
        <Alert variant="error" title="Corrija o JSON">
          <ul className="list-disc pl-4">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      {result && (
        <Alert variant="success" title="Edital cadastrado">
          {result.subjects} disciplina(s) e {result.topics} assunto(s) (
          {result.target === "catalog" ? "catálogo" : "privado"}).{" "}
          <Link href={`/concursos/${result.examId}`} className="underline">
            Ver concurso
          </Link>
        </Alert>
      )}
      <Button onClick={submit} loading={loading} disabled={!text.trim()}>
        Cadastrar
      </Button>
    </Card>
  );
}
