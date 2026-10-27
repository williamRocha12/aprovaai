"use client";

import { USER_ROLES, type AdminUser, type UserRole } from "@aprovaai/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, EmptyState, LoadingState } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface UsersPage {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
}

const ROLE_LABELS: Record<UserRole, string> = { user: "Candidato", editor: "Editor", admin: "Admin" };
const PAGE_SIZE = 20;

export function UsersTable({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (deferredSearch) params.set("search", deferredSearch);

  const users = useQuery({
    queryKey: ["admin-users", deferredSearch, page],
    queryFn: () => api.get<UsersPage>(`/api/admin/users?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.patch(`/api/admin/users/${id}/role`, { role }),
    onSuccess: invalidate,
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) =>
      api.patch(`/api/admin/users/${id}/status`, { status }),
    onSuccess: invalidate,
  });

  const mutationError = changeRole.error ?? changeStatus.error;
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <label htmlFor="search-users" className="sr-only">
          Buscar por nome ou e-mail
        </label>
        <Input
          id="search-users"
          placeholder="Buscar por nome ou e-mail"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {mutationError && <Alert variant="error">{errorMessage(mutationError)}</Alert>}

      {users.isPending ? (
        <LoadingState label="Carregando usuários..." />
      ) : users.isError ? (
        <Alert variant="error">{errorMessage(users.error)}</Alert>
      ) : users.data.items.length === 0 ? (
        <EmptyState
          title="Nenhum usuário encontrado."
          description={deferredSearch ? "Tente outro termo de busca." : undefined}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-medium">
                    Usuário
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Cadastro
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Papel
                  </th>
                  <th scope="col" className="p-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data.items.map((u) => {
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id}>
                      <td className="p-3">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-muted-foreground">
                          {u.email} {!u.emailVerified && <Badge tone="warning">e-mail não confirmado</Badge>}
                        </p>
                      </td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(u.createdAt)}</td>
                      <td className="p-3">
                        <label htmlFor={`role-${u.id}`} className="sr-only">
                          Papel de {u.name}
                        </label>
                        <Select
                          id={`role-${u.id}`}
                          className="h-8 w-36"
                          value={u.role}
                          disabled={isSelf || changeRole.isPending}
                          onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value as UserRole })}
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={u.status === "active" ? "success" : "danger"}>
                            {u.status === "active" ? "Ativo" : "Desativado"}
                          </Badge>
                          {!isSelf && (
                            <Button
                              variant="outline"
                              size="sm"
                              loading={changeStatus.isPending && changeStatus.variables?.id === u.id}
                              onClick={() =>
                                changeStatus.mutate({
                                  id: u.id,
                                  status: u.status === "active" ? "disabled" : "active",
                                })
                              }
                            >
                              {u.status === "active" ? "Desativar" : "Reativar"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {users.data.total} usuário(s) · página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
