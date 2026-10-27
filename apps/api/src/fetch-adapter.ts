import type { FastifyInstance } from "fastify";

// Headers hop-by-hop não atravessam o adaptador.
const SKIPPED_HEADERS = new Set(["connection", "keep-alive", "transfer-encoding", "content-length"]);

/**
 * Executa uma Request (Fetch API) dentro do Fastify, sem abrir porta HTTP.
 * É assim que a API roda numa Vercel Function: a rota do Next repassa a requisição para cá.
 */
export async function handleFetchRequest(app: FastifyInstance, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!SKIPPED_HEADERS.has(key)) headers[key] = value;
  });

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;

  const result = await app.inject({
    method: request.method as "GET",
    url: url.pathname + url.search,
    headers,
    ...(body && body.length > 0 ? { payload: body } : {}),
  });

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (value === undefined || SKIPPED_HEADERS.has(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(key, String(item));
  }

  // 204/304 e HEAD não podem ter corpo na Response.
  const noBody = result.statusCode === 204 || result.statusCode === 304 || request.method === "HEAD";
  return new Response(noBody ? null : new Uint8Array(result.rawPayload), {
    status: result.statusCode,
    headers: responseHeaders,
  });
}
