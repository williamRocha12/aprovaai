import { ApiRequestError, errorMessage } from "./api";

// O Better Auth responde em inglês; traduzimos pelos códigos estáveis.
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha inválidos.",
  EMAIL_NOT_VERIFIED:
    "Confirme seu e-mail antes de entrar. Enviamos um novo link para a sua caixa de entrada.",
  LOGIN_LOCKED: "Muitas tentativas de login. Tente novamente em alguns minutos.",
  ACCOUNT_DISABLED: "Esta conta está desativada.",
  TERMS_NOT_ACCEPTED: "É preciso aceitar os termos de uso e a política de privacidade.",
  INVALID_TOKEN: "Link inválido ou expirado. Peça um novo.",
  INVALID_PASSWORD: "Senha atual incorreta.",
  PASSWORD_TOO_SHORT: "Senha curta demais.",
  PASSWORD_TOO_LONG: "Senha longa demais.",
  SESSION_EXPIRED: "Por segurança, entre novamente antes de fazer esta alteração.",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code] as string;
    if (error.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  }
  return errorMessage(error);
}
