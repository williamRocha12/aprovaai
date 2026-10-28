import "server-only";
import { getApi } from "@aprovaai/api";
import type { MeResponse } from "@aprovaai/shared";
import { cookies } from "next/headers";

/**
 * GET na API a partir de Server Components, no mesmo processo (sem ida à rede),
 * com o cookie de sessão da requisição.
 */
export async function serverGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const cookieHeader = (await cookies()).toString();
  const api = await getApi();
  const response = await api.inject({
    method: "GET",
    url: path,
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  if (response.statusCode >= 500) throw new Error(`API respondeu ${response.statusCode} em ${path}.`);
  return { status: response.statusCode, data: response.statusCode === 200 ? response.json<T>() : null };
}

/** Usuário logado (null sem sessão válida). */
export async function getCurrentUser(): Promise<MeResponse | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  const { data } = await serverGet<MeResponse>("/api/me");
  return data;
}

/** true se o usuário estuda ao menos um concurso ativo (onboarding feito). */
export async function hasGoal(): Promise<boolean> {
  const { data } = await serverGet<{ status: string }[]>("/api/goals");
  return (data ?? []).some((g) => g.status === "ativo");
}
