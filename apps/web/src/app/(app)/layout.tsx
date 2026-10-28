import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/server-api";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

/** Área logada: a sessão é conferida no servidor, contra a API, a cada navegação. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  const links = [
    { href: "/agora", label: "Agora" },
    { href: "/plano", label: "Plano" },
    { href: "/concursos", label: "Concursos" },
    { href: "/conta", label: "Conta" },
    ...(user.role === "admin" ? [{ href: "/admin/usuarios", label: "Admin" }] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/agora" className="text-lg font-bold text-primary">
            AprovaAI
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
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
