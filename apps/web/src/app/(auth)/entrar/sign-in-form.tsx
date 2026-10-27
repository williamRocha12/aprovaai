"use client";

import { signInSchema, type SignInInput } from "@aprovaai/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldAria } from "@/components/ui/form";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

type SignInOutput = z.output<typeof signInSchema>;

export function SignInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput, unknown, SignInOutput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post("/api/auth/sign-in/email", { ...values, callbackURL: "/email-verificado" });
      router.replace("/conta");
      router.refresh();
    } catch (error) {
      setServerError(authErrorMessage(error));
    }
  });

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

      <Field id="password" label="Senha" error={errors.password?.message}>
        <Input
          {...fieldAria("password", errors.password?.message)}
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
      </Field>

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}
