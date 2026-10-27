import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/feedback";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Entrar" };

export default function SignInPage() {
  return (
    <Card>
      <h1 className="text-2xl font-semibold">Entrar</h1>
      <div className="mt-6">
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
