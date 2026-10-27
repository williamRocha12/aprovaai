import "server-only";
import { getApi } from "@aprovaai/api";
import type { MeResponse } from "@aprovaai/shared";
import { cookies } from "next/headers";

/**
 * Busca o usuário logado nos Server Components chamando a API no mesmo processo
 * (sem ida à rede), com o cookie de sessão da requisição.
 * Devolve null sem sessão válida; outros erros sobem para o error boundary.
 */
export async function getCurrentUser(): Promise<MeResponse | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  const api = await getApi();
  const response = await api.inject({ method: "GET", url: "/api/me", headers: { cookie: cookieHeader } });
  if (response.statusCode === 401) return null;
  if (response.statusCode !== 200)
    throw new Error(`API respondeu ${response.statusCode} ao buscar o usuário.`);
  return response.json<MeResponse>();
}
