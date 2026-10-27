import type { FastifyInstance } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { AUTH_BASE_PATH, type Auth } from "../../auth/auth";

/**
 * Monta o handler do Better Auth (Fetch API) dentro do Fastify.
 * O Fastify já fez o parse do JSON; aqui o corpo é reconstruído para o Request.
 */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth, appUrl: string): void {
  app.route({
    method: ["GET", "POST"],
    url: `${AUTH_BASE_PATH}/*`,
    schema: { hide: true },
    async handler(request, reply) {
      const url = new URL(request.url, appUrl);
      const hasBody = request.method !== "GET" && request.body !== undefined;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);

      return reply.send(response.body ? await response.text() : null);
    },
  });
}
