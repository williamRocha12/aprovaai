"use client";

import { resetPasswordSchema } from "@aprovaai/shared";
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

type Values = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null);
    try {
      await api.post("/api/auth/reset-password", { token, newPassword: password });
      setDone(true);
    } catch (error) {
      setServerError(authErrorMessage(error));
    }
  });

  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          Senha alterada. Por segurança, encerramos as sessões abertas em outros aparelhos.
        </Alert>
        <Link href="/entrar" className="block text-center text-sm font-medium text-primary hover:underline">
          Entrar com a nova senha
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && <Alert variant="error">{serverError}</Alert>}
      <Field
        id="password"
        label="Nova senha"
        error={errors.password?.message}
        hint="Mínimo de 10 caracteres, com letras e números."
      >
        <Input
          {...fieldAria("password", errors.password?.message, true)}
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
      </Field>
      <Field id="confirmPassword" label="Confirme a nova senha" error={errors.confirmPassword?.message}>
        <Input
          {...fieldAria("confirmPassword", errors.confirmPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Salvar nova senha
      </Button>
    </form>
  );
}
