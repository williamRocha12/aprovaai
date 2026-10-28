import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser, serverGet } from "@/lib/server-api";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

interface PublicConfig {
  mockExamsEnabled: boolean;
  aiEnabled: boolean;
}

/** Área logada: a sessão é conferida no servidor, contra a API, a cada navegação. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  const { data: config } = await serverGet<PublicConfig>("/api/public/config");
  const isEditor = user.role === "editor" || user.role === "admin";

  const links = [
    { href: "/agora", label: "Agora" },
    { href: "/plano", label: "Plano" },
    { href: "/questoes", label: "Questões" },
    { href: "/revisoes", label: "Revisões" },
    ...(config?.mockExamsEnabled ? [{ href: "/simulados", label: "Simulados" }] : []),
    { href: "/painel", label: "Painel" },
    { href: "/concursos", label: "Concursos" },
    { href: "/provas", label: "Provas" },
    ...(isEditor ? [{ href: "/moderacao", label: "Moderação" }] : []),
    ...(user.role === "admin" ? [{ href: "/admin/usuarios", label: "Admin" }] : []),
    { href: "/conta", label: "Conta" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/agora" className="shrink-0 text-lg font-bold text-primary">
            AprovaAI
          </Link>
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <NavLinks links={links} />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
