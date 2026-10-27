"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="conteudo" className="mx-auto max-w-md px-4 py-16">
      <Alert variant="error" title="Algo deu errado">
        Não conseguimos carregar esta página. Se o problema continuar, tente mais tarde.
      </Alert>
      <Button className="mt-6" onClick={reset}>
        Tentar de novo
      </Button>
    </main>
  );
}
