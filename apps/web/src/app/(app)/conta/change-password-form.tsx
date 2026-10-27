"use client";

import { changePasswordSchema } from "@aprovaai/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldAria } from "@/components/ui/form";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

type Values = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setStatus(null);
    try {
      await api.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      reset();
      setStatus({ kind: "success", text: "Senha alterada. As outras sessões foram encerradas." });
    } catch (error) {
      setStatus({ kind: "error", text: authErrorMessage(error) });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-3">
      {status && (
        <div className="md:col-span-3">
          <Alert variant={status.kind}>{status.text}</Alert>
        </div>
      )}
      <Field id="currentPassword" label="Senha atual" error={errors.currentPassword?.message}>
        <Input
          {...fieldAria("currentPassword", errors.currentPassword?.message)}
          type="password"
          autoComplete="current-password"
          {...register("currentPassword")}
        />
      </Field>
      <Field id="newPassword" label="Nova senha" error={errors.newPassword?.message}>
        <Input
          {...fieldAria("newPassword", errors.newPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...register("newPassword")}
        />
      </Field>
      <Field id="confirmNewPassword" label="Confirme a nova senha" error={errors.confirmPassword?.message}>
        <Input
          {...fieldAria("confirmNewPassword", errors.confirmPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
      </Field>
      <div className="md:col-span-3">
        <Button type="submit" loading={isSubmitting}>
          Alterar senha
        </Button>
      </div>
    </form>
  );
}
