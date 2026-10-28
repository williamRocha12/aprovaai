import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/server-api";
import { NavLinks } from "../nav-links";

/** A checagem aqui só esconde as telas; quem autoriza de verdade é a API (RBAC editor/admin). */
export default async function ModerationLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user?.role !== "editor" && user?.role !== "admin") notFound();
  return (
    <div className="space-y-6">
      <NavLinks
        links={[
          { href: "/moderacao/radar", label: "Radar de editais" },
          { href: "/moderacao", label: "Reportes de questões", exact: true },
        ]}
      />
      {children}
    </div>
  );
}
