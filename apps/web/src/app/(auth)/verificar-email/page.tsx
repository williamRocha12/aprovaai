import type { Metadata } from "next";
import { Card } from "@/components/ui/feedback";
import { ResendVerification } from "./resend-verification";

export const metadata: Metadata = { title: "Confirme seu e-mail" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <Card>
      <h1 className="text-2xl font-semibold">Confirme seu e-mail</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Se o endereço puder ser usado, enviamos um link de confirmação
        {email ? (
          <>
            {" "}
            para <strong className="text-foreground">{email}</strong>
          </>
        ) : null}
        . Abra o e-mail e clique em <strong>Confirmar e-mail</strong>. O link vale por 24 horas.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">Não chegou? Confira o spam ou peça outro link.</p>
      <div className="mt-6">
        <ResendVerification defaultEmail={email ?? ""} />
      </div>
    </Card>
  );
}
