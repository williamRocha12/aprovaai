import { ERROR_CODES, type ApiError, type ErrorCode } from "@aprovaai/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors";

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  429: ERROR_CODES.RATE_LIMITED,
};

function body(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/** Formato de erro único para toda a API. Erros 5xx nunca expõem detalhes internos. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message, error.details));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((v) => ({
        path: v.instancePath.replace(/^\//, "").replaceAll("/", "."),
        message: v.message,
      }));
      return reply.status(400).send(body(ERROR_CODES.VALIDATION_ERROR, "Dados inválidos.", details));
    }

    const status = error.statusCode ?? 500;
    if (status < 500) {
      const code = CODE_BY_STATUS[status] ?? ERROR_CODES.VALIDATION_ERROR;
      const message =
        status === 429 ? "Muitas requisições. Aguarde um pouco e tente de novo." : error.message;
      return reply.status(status).send(body(code, message));
    }

    request.log.error({ err: error }, "erro não tratado");
    return reply
      .status(500)
      .send(body(ERROR_CODES.INTERNAL_ERROR, "Erro interno. Tente novamente mais tarde."));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(body(ERROR_CODES.NOT_FOUND, "Rota não encontrada.")),
  );
}
