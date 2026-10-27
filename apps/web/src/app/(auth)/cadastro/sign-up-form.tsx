"use client";

import { signUpSchema, type SignUpInput } from "@aprovaai/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldAria } from "@/components/ui/form";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

type SignUpOutput = z.output<typeof signUpSchema>;

export function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput, unknown, SignUpOutput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api.post("/api/auth/sign-up/email", { ...values, callbackURL: "/email-verificado" });
      router.push(`/verificar-email?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      setServerError(authErrorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <Field id="name" label="Nome" error={errors.name?.message}>
        <Input {...fieldAria("name", errors.name?.message)} autoComplete="name" {...register("name")} />
      </Field>

      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          {...fieldAria("email", errors.email?.message)}
          type="email"
          autoComplete="email"
          {...register("email")}
        />
      </Field>

      <Field
        id="password"
        label="Senha"
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

      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            aria-invalid={errors.acceptTerms ? true : undefined}
            {...register("acceptTerms")}
          />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="text-primary underline">
              termos de uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="text-primary underline">
              política de privacidade
            </Link>
            .
          </span>
        </label>
        {errors.acceptTerms && (
          <p role="alert" className="text-xs text-danger">
            {errors.acceptTerms.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" loading={isSubmitting}>
        Criar conta
      </Button>
    </form>
  );
}
