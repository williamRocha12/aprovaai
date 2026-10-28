import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/feedback";
import { getCurrentUser } from "@/lib/server-api";
import { ChangePasswordForm } from "./change-password-form";
import { ProfileForm } from "./profile-form";
import { SessionsPanel } from "./sessions-panel";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {user.profile.displayName ?? user.name}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold">Plano de estudos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Concurso-alvo, horas por dia, disciplinas ativas, autoavaliação e data da prova.
        </p>
        <Link href="/onboarding" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          Editar plano
        </Link>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Perfil</h2>
        <div className="mt-4">
          <ProfileForm user={user} />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Senha</h2>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Sessões ativas</h2>
        <div className="mt-4">
          <SessionsPanel />
        </div>
      </Card>
    </div>
  );
}
