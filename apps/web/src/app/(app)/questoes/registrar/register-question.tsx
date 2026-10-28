"use client";

import {
  ERROR_TYPES,
  ERROR_TYPE_LABELS,
  personalQuestionSchema,
  quickRegisterSchema,
} from "@aprovaai/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { subjectsOf, useGoalTopics } from "@/components/questions/use-goal-topics";
import { Button } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";
import { Field, Input, Select, fieldAria } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "rapido" | "completo";
const LETTERS = ["A", "B", "C", "D", "E"];

function useTaxonomy() {
  const topics = useGoalTopics();
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  return {
    subjectId,
    topicId,
    subjects: subjectsOf(topics.data ?? []),
    topics: (topics.data ?? []).filter((t) => t.subjectId === subjectId),
    setSubject: (id: string) => {
      setSubjectId(id);
      setTopicId("");
    },
    setTopicId,
  };
}

function TaxonomyFields({ tax }: { tax: ReturnType<typeof useTaxonomy> }) {
  return (
    <>
      <Field
        id="q-subject"
        label="Disciplina"
        hint={
          tax.subjects.length === 0 ? "Configure seu plano para escolher disciplinas do edital." : undefined
        }
      >
        <Select
          {...fieldAria("q-subject")}
          value={tax.subjectId}
          onChange={(e) => tax.setSubject(e.target.value)}
        >
          <option value="">Não informar</option>
          {tax.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="q-topic" label="Assunto">
        <Select
          {...fieldAria("q-topic")}
          value={tax.topicId}
          disabled={!tax.subjectId}
          onChange={(e) => tax.setTopicId(e.target.value)}
        >
          <option value="">Não informar</option>
          {tax.topics.map((t) => (
            <option key={t.topicId} value={t.topicId}>
              {t.topicName}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

export function RegisterQuestion() {
  const [mode, setMode] = useState<Mode>("rapido");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/questoes" className="text-sm text-primary hover:underline">
          ← Questões
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Registrar questão</h1>
      </div>
      <div className="flex gap-2" role="tablist">
        {(["rapido", "completo"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              mode === m ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {m === "rapido" ? "Cadastro rápido" : "Questão completa"}
          </button>
        ))}
      </div>
      {mode === "rapido" ? <QuickForm /> : <FullForm />}
    </div>
  );
}

function QuickForm() {
  const tax = useTaxonomy();
  const [type, setType] = useState<"multipla_escolha" | "certo_errado">("multipla_escolha");
  const [board, setBoard] = useState("");
  const [year, setYear] = useState("");
  const [platform, setPlatform] = useState("");
  const [reference, setReference] = useState("");
  const [myAnswer, setMyAnswer] = useState("");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [errorType, setErrorType] = useState("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = quickRegisterSchema.safeParse({
      type,
      subjectId: tax.subjectId || null,
      topicId: tax.topicId || null,
      board: board || undefined,
      year: year ? Number(year) : undefined,
      externalSource: platform || undefined,
      reference: reference || undefined,
      myAnswer: myAnswer || undefined,
      isCorrect: isCorrect ?? undefined,
      errorType: isCorrect === false && errorType ? errorType : null,
    });
    if (!parsed.success) {
      setStatus({ kind: "error", text: parsed.error.issues[0]?.message ?? "Confira os campos." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await api.post("/api/questions/quick", parsed.data);
      setStatus({
        kind: "success",
        text: isCorrect
          ? "Registrada. Acerto contabilizado no seu desempenho."
          : "Registrada. Ela volta na revisão de amanhã.",
      });
      setReference("");
      setMyAnswer("");
      setIsCorrect(null);
      setErrorType("");
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-muted-foreground">
        Para questões resolvidas em outra plataforma: registre só os metadados e o resultado. O enunciado não
        é copiado.
      </p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {status && (
          <div className="sm:col-span-2">
            <Alert variant={status.kind}>{status.text}</Alert>
          </div>
        )}
        <TaxonomyFields tax={tax} />
        <Field id="q-type" label="Tipo">
          <Select
            {...fieldAria("q-type")}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="multipla_escolha">Múltipla escolha</option>
            <option value="certo_errado">Certo ou errado</option>
          </Select>
        </Field>
        <Field id="q-board" label="Banca">
          <Input
            {...fieldAria("q-board")}
            value={board}
            maxLength={100}
            onChange={(e) => setBoard(e.target.value)}
            placeholder="Ex.: FCC"
          />
        </Field>
        <Field id="q-year" label="Ano">
          <Input
            {...fieldAria("q-year")}
            type="number"
            min={1990}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
        <Field id="q-platform" label="Plataforma de origem">
          <Input
            {...fieldAria("q-platform")}
            value={platform}
            maxLength={100}
            onChange={(e) => setPlatform(e.target.value)}
          />
        </Field>
        <Field id="q-ref" label="Referência (código da questão)">
          <Input
            {...fieldAria("q-ref")}
            value={reference}
            maxLength={300}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field id="q-answer" label="Minha resposta">
          <Select {...fieldAria("q-answer")} value={myAnswer} onChange={(e) => setMyAnswer(e.target.value)}>
            <option value="">Não informar</option>
            {(type === "certo_errado" ? ["C", "E"] : LETTERS).map((l) => (
              <option key={l} value={l}>
                {type === "certo_errado" ? (l === "C" ? "Certo" : "Errado") : l}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">Resultado</legend>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={isCorrect === true ? "primary" : "outline"}
              onClick={() => setIsCorrect(true)}
            >
              Acertei
            </Button>
            <Button
              type="button"
              variant={isCorrect === false ? "danger" : "outline"}
              onClick={() => setIsCorrect(false)}
            >
              Errei
            </Button>
          </div>
        </fieldset>
        {isCorrect === false && (
          <Field id="q-error" label="Por que errou?">
            <Select
              {...fieldAria("q-error")}
              value={errorType}
              onChange={(e) => setErrorType(e.target.value)}
            >
              <option value="">Classificar depois</option>
              {ERROR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ERROR_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving} disabled={isCorrect === null}>
            Registrar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FullForm() {
  const tax = useTaxonomy();
  const [type, setType] = useState<"multipla_escolha" | "certo_errado">("multipla_escolha");
  const [statement, setStatement] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [board, setBoard] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string; id?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = personalQuestionSchema.safeParse({
      type,
      subjectId: tax.subjectId || null,
      topicId: tax.topicId || null,
      statement,
      options:
        type === "certo_errado"
          ? []
          : options.map((text, i) => ({ label: LETTERS[i], text: text.trim() })).filter((o) => o.text),
      correctAnswer,
      explanation: explanation || undefined,
      board: board || undefined,
      year: year ? Number(year) : undefined,
    });
    if (!parsed.success) {
      setStatus({ kind: "error", text: parsed.error.issues[0]?.message ?? "Confira os campos." });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const created = await api.post<{ id: string }>("/api/questions", parsed.data);
      setStatus({ kind: "success", text: "Questão criada (privada).", id: created.id });
      setStatement("");
      setOptions(["", "", "", ""]);
      setCorrectAnswer("");
      setExplanation("");
    } catch (err) {
      setStatus({ kind: "error", text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {status && (
          <div className="sm:col-span-2">
            <Alert variant={status.kind}>
              {status.text}{" "}
              {status.id && (
                <Link href={`/questoes/${status.id}`} className="underline">
                  Abrir
                </Link>
              )}
            </Alert>
          </div>
        )}
        <TaxonomyFields tax={tax} />
        <Field id="f-type" label="Tipo">
          <Select
            {...fieldAria("f-type")}
            value={type}
            onChange={(e) => {
              setType(e.target.value as typeof type);
              setCorrectAnswer("");
            }}
          >
            <option value="multipla_escolha">Múltipla escolha</option>
            <option value="certo_errado">Certo ou errado</option>
          </Select>
        </Field>
        <Field id="f-board" label="Banca">
          <Input
            {...fieldAria("f-board")}
            value={board}
            maxLength={100}
            onChange={(e) => setBoard(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="f-statement" label="Enunciado">
            <textarea
              {...fieldAria("f-statement")}
              value={statement}
              rows={5}
              maxLength={10_000}
              onChange={(e) => setStatement(e.target.value)}
              className="w-full rounded-md border border-border bg-surface p-3 text-sm"
            />
          </Field>
        </div>
        {type === "multipla_escolha" &&
          options.map((text, i) => (
            <Field key={i} id={`f-opt-${i}`} label={`Alternativa ${LETTERS[i]}`}>
              <Input
                {...fieldAria(`f-opt-${i}`)}
                value={text}
                maxLength={2000}
                onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
              />
            </Field>
          ))}
        {type === "multipla_escolha" && options.length < 5 && (
          <div className="sm:col-span-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOptions([...options, ""])}>
              + Alternativa E
            </Button>
          </div>
        )}
        <Field id="f-answer" label="Gabarito">
          <Select
            {...fieldAria("f-answer")}
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
          >
            <option value="">Selecione</option>
            {(type === "certo_errado" ? ["C", "E"] : LETTERS.slice(0, options.length)).map((l) => (
              <option key={l} value={l}>
                {type === "certo_errado" ? (l === "C" ? "Certo" : "Errado") : l}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-year" label="Ano">
          <Input
            {...fieldAria("f-year")}
            type="number"
            min={1990}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="f-expl" label="Explicação (opcional)">
            <textarea
              {...fieldAria("f-expl")}
              value={explanation}
              rows={3}
              maxLength={10_000}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full rounded-md border border-border bg-surface p-3 text-sm"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={saving}>
            Salvar questão
          </Button>
        </div>
      </form>
    </Card>
  );
}
