import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/server-api";
import { PastExamImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importar prova anterior" };

/** Só esconde a tela; quem autoriza a importação é a API (RBAC editor/admin). */
export default async function ImportPastExamPage() {
  const user = await getCurrentUser();
  if (user?.role !== "editor" && user?.role !== "admin") notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar prova anterior</h1>
        <p className="text-sm text-muted-foreground">
          Use só o PDF oficial publicado pela banca ou pelo órgão e informe o link da fonte. O PDF é lido no
          seu navegador; só o texto é enviado. A leitura automática separa as questões e o gabarito, e você
          revisa os assuntos antes de a prova entrar no Raio-X.
        </p>
      </div>
      <PastExamImportForm />
    </div>
  );
}
