import type { Metadata } from "next";
import Link from "next/link";
import { GoogleSignIn } from "@/components/google-sign-in";
import { Card } from "@/components/ui/feedback";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <Card>
      <h1 className="text-2xl font-semibold">Criar conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Leva um minuto. Você confirma o e-mail e já começa.
      </p>
      <div className="mt-6 space-y-4">
        <GoogleSignIn termsNotice />
        <SignUpForm />
      </div>
      <p className="mt-6 text-center text-sm">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
