import type { Metadata } from "next";
import Link from "next/link";
import { GoogleSignIn } from "@/components/google-sign-in";
import { Alert, Card } from "@/components/ui/feedback";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Entrar" };

/** `?erro=google` vem do retorno do OAuth quando o login com Google falha ou é cancelado. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;

  return (
    <Card>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      {erro === "google" && (
        <div className="mt-4">
          <Alert variant="error">
            Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.
          </Alert>
        </div>
      )}
      <div className="mt-6 space-y-4">
        <GoogleSignIn />
        <SignInForm />
      </div>
      <div className="mt-6 space-y-2 text-center text-sm">
        <p>
          <Link href="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
        <p>
          Não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </Card>
  );
}
