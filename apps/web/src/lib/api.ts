// Cliente HTTP do navegador. Sempre chama o próprio domínio (/api/*); o Next repassa para a API.

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Confira os dados informados.",
  401: "Sua sessão expirou. Entre novamente.",
  403: "Você não tem permissão para esta ação.",
  404: "Não encontrado.",
  429: "Muitas tentativas. Aguarde um pouco e tente de novo.",
};

/**
 * Lê o erro nos dois formatos possíveis: o da nossa API ({ error: { code, message } })
 * e o do Better Auth ({ code, message }).
 */
async function toError(response: Response): Promise<ApiRequestError> {
  let code = "UNKNOWN";
  let message = FALLBACK_MESSAGES[response.status] ?? "Algo deu errado. Tente novamente.";
  let details: unknown;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const err = (body.error && typeof body.error === "object" ? body.error : body) as Record<string, unknown>;
    if (typeof err.code === "string") code = err.code;
    if (typeof err.message === "string" && err.message) message = err.message;
    details = err.details;
  } catch {
    // corpo vazio ou não-JSON: fica a mensagem padrão do status
  }
  return new ApiRequestError(response.status, code, message, details);
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown = {}) => apiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  request: <T>(method: string, path: string, body?: unknown) => apiFetch<T>(path, { method, body }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "Não foi possível conectar ao servidor. Verifique sua conexão.";
}
