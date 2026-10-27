/**
 * IP do cliente a partir do header confiável configurado (CLIENT_IP_HEADER).
 * Sem header configurado devolve o fallback (IP do socket, normalmente o próprio proxy).
 */
export function clientIpFrom(
  getHeader: (name: string) => string | null | undefined,
  trustedHeader: string | undefined,
  fallback: string | null = null,
): string | null {
  if (!trustedHeader) return fallback;
  const value = getHeader(trustedHeader);
  return value?.split(",")[0]?.trim() || fallback;
}
