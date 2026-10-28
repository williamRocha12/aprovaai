// Toda a API (/api/*) roda aqui dentro, numa Vercel Function Node.js.
// O Fastify é inicializado uma vez por instância e reaproveitado entre requisições.
import { getApi, handleFetchRequest } from "@aprovaai/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A extração de edital por IA pode levar alguns minutos (limite do plano Hobby com Fluid compute: 300 s).
export const maxDuration = 300;

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
