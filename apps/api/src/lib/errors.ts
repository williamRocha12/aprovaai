import { ERROR_CODES, type ErrorCode } from "@aprovaai/shared";

/** Erro de domínio com status HTTP e código estável (o front decide a mensagem pelo código). */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthenticated = () =>
  new AppError(401, ERROR_CODES.UNAUTHENTICATED, "Faça login para continuar.");

export const forbidden = (message = "Você não tem permissão para esta ação.") =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message);

/** Também usado para recurso de outro usuário: não revelamos que ele existe. */
export const notFound = (message = "Recurso não encontrado.") =>
  new AppError(404, ERROR_CODES.NOT_FOUND, message);

export const conflict = (message: string) => new AppError(409, ERROR_CODES.CONFLICT, message);
