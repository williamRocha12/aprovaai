import { LEGAL_DOCS_VERSION } from "@aprovaai/shared";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/feedback";
import { SiteHeader } from "@/components/site-header";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Versão {LEGAL_DOCS_VERSION}</p>
        <div className="mt-6">
          <Alert variant="warning" title="Rascunho pendente de revisão jurídica">
            Este texto é provisório e será revisado por um profissional antes do lançamento público.
          </Alert>
        </div>
        <div className="mt-8 space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold">
          {children}
        </div>
      </main>
    </>
  );
}
