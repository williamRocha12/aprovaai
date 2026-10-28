import type { ExamDetail, MeResponse } from "@aprovaai/shared";
import type { Metadata } from "next";
import { serverGet } from "@/lib/server-api";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Cadastrar edital" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ exame?: string }> }) {
  const { exame } = await searchParams;
  const me = await serverGet<MeResponse>("/api/me");
  const isEditor = me.data?.role === "editor" || me.data?.role === "admin";
  // Editor completando um concurso confirmado pelo radar (ainda sem conteúdo programático).
  const target =
    isEditor && exame
      ? (await serverGet<ExamDetail>(`/api/catalog/exams/${encodeURIComponent(exame)}`)).data
      : null;
  const targetExam = target && !target.notice ? { id: target.id, title: target.title } : null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cadastrar a partir do edital</h1>
        <p className="text-sm text-muted-foreground">
          {isEditor
            ? "Como editor, você pode publicar no catálogo (rascunho até validar) ou criar um concurso privado."
            : "Seu concurso fica privado: só você vê. Um editor pode promovê-lo ao catálogo depois."}
        </p>
      </div>
      <ImportForm isEditor={isEditor} targetExam={targetExam} />
    </div>
  );
}
