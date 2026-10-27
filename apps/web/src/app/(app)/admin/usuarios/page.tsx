import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/server-api";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Usuários" };

/** A checagem aqui só esconde a tela; quem autoriza de verdade é a API (RBAC no backend). */
export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Alterações de papel e status ficam registradas na auditoria.
        </p>
      </div>
      <UsersTable currentUserId={user.id} />
    </div>
  );
}
