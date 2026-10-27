"use client";

import { forgotPasswordSchema } from "@aprovaai/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldAria } from "@/components/ui/form";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof forgotPasswordSchema>, unknown, z.output<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await api.post("/api/auth/request-password-reset", { email, redirectTo: "/redefinir-senha" });
      setSent(true);
    } catch (error) {
      setServerError(authErrorMessage(error));
    }
  });

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 30
          minutos.
        </Alert>
        <Link href="/entrar" className="block text-center text-sm text-primary hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          {...register("email")}
        />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Enviar link
      </Button>
    </form>
  );
}
