"use client";

import { emailSchema } from "@aprovaai/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldAria } from "@/components/ui/form";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/auth-errors";

export function ResendVerification({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "E-mail inválido.");
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      await api.post("/api/auth/send-verification-email", {
        email: parsed.data,
        callbackURL: "/email-verificado",
      });
      setStatus("sent");
    } catch (err) {
      setError(authErrorMessage(err));
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {status === "sent" && (
        <Alert variant="success">
          Se a conta existir e ainda não estiver confirmada, um novo link foi enviado.
        </Alert>
      )}
      <Field id="resend-email" label="E-mail" error={error ?? undefined}>
        <Input
          {...fieldAria("resend-email", error ?? undefined)}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="outline" className="w-full" loading={status === "sending"}>
        Reenviar link
      </Button>
    </form>
  );
}
