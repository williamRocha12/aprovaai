"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, fieldAria } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

/** LGPD: exportar os próprios dados e excluir a conta. */
export function PrivacyPanel({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      await api.request("DELETE", "/api/me", { confirmEmail, password: password || undefined });
      router.replace("/?conta=excluida");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p>
          Baixe uma cópia de todos os seus dados (plano, questões, tentativas, sessões, simulados e
          consentimentos) em JSON.
        </p>
        <a
          href="/api/me/export"
          download
          className="mt-2 inline-flex h-8 items-center rounded-md border border-border px-3 hover:bg-muted"
        >
          Exportar meus dados
        </a>
      </div>
      <div className="border-t border-border pt-4">
        <p>
          Excluir a conta apaga seus dados pessoais e de estudo. A trilha de auditoria e o registro de aceite
          dos termos ficam, sem nenhum vínculo com você. <strong>Não dá para desfazer.</strong>
        </p>
        {!open ? (
          <Button variant="danger" size="sm" className="mt-2" onClick={() => setOpen(true)}>
            Excluir minha conta
          </Button>
        ) : (
          <form onSubmit={deleteAccount} className="mt-3 max-w-md space-y-3">
            {error && <Alert variant="error">{error}</Alert>}
            <Field id="del-email" label={`Digite seu e-mail (${email}) para confirmar`}>
              <Input
                {...fieldAria("del-email")}
                type="email"
                autoComplete="off"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
              />
            </Field>
            <Field id="del-password" label="Senha" hint="Quem entra só com Google pode deixar em branco.">
              <Input
                {...fieldAria("del-password", undefined, true)}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="danger"
                loading={deleting}
                disabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
              >
                Excluir definitivamente
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
