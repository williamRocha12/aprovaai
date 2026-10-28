import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Card } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "E-mail confirmado" };

/** Destino do link de verificação. O Better Auth redireciona para cá com ?error= se o token falhar. */
export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  if (error) {
    return (
      <Card>
        <h1 className="text-2xl font-semibold">Não foi possível confirmar</h1>
        <div className="mt-4">
          <Alert variant="error">O link é inválido ou expirou. Peça um novo link de confirmação.</Alert>
        </div>
        <Link href="/verificar-email" className={buttonVariants({ className: "mt-6 w-full" })}>
          Pedir novo link
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-semibold">E-mail confirmado</h1>
      <div className="mt-4">
        <Alert variant="success">Sua conta está ativa.</Alert>
      </div>
      <Link href="/agora" className={buttonVariants({ className: "mt-6 w-full" })}>
        Continuar
      </Link>
    </Card>
  );
}
