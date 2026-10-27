import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/server-api";
import { SignOutButton } from "./sign-out-button";

/** Área logada: a sessão é conferida no servidor, contra a API, a cada navegação. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/conta" className="text-lg font-bold text-primary">
            AprovaAI
          </Link>
          <nav aria-label="Área logada" className="flex items-center gap-4 text-sm">
            <Link href="/conta" className="hover:underline">
              Minha conta
            </Link>
            {user.role === "admin" && (
              <Link href="/admin/usuarios" className="hover:underline">
                Admin
              </Link>
            )}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
