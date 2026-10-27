import type { Metadata } from "next";
import { Card } from "@/components/ui/feedback";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <h1 className="text-2xl font-semibold">Recuperar senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Informe seu e-mail e enviaremos um link para criar uma nova senha.
      </p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </Card>
  );
}
