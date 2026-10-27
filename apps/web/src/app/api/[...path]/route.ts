// Toda a API (/api/*) roda aqui dentro, numa Vercel Function Node.js.
// O Fastify é inicializado uma vez por instância e reaproveitado entre requisições.
import { getApi, handleFetchRequest } from "@aprovaai/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request): Promise<Response> {
  const api = await getApi();
  return handleFetchRequest(api, request);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
