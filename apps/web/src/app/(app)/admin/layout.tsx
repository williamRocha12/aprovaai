import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/server-api";
import { NavLinks } from "../nav-links";

/** A checagem aqui só esconde as telas; quem autoriza de verdade é a API (RBAC no backend). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") notFound();
  return (
    <div className="space-y-6">
      <NavLinks
        links={[
          { href: "/admin/usuarios", label: "Usuários" },
          { href: "/admin/metricas", label: "Métricas" },
          { href: "/admin/flags", label: "Feature flags" },
          { href: "/admin/jobs", label: "Tarefas" },
        ]}
      />
      {children}
    </div>
  );
}
