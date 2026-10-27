import { z } from "zod";

/** Versão vigente dos termos e da política de privacidade (gravada no aceite). */
export const LEGAL_DOCS_VERSION = "2026-10-27";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail longo demais.")
  .pipe(z.email("E-mail inválido."))
  .transform((v) => v.toLowerCase());

/** Política de senha: comprimento é o que mais importa (NIST 800-63B); exigimos letra e número. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`)
  .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), "Use letras e números na senha.");

export const nameSchema = z.string().trim().min(2, "Informe seu nome.").max(80, "Nome longo demais.");

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: "É preciso aceitar os termos de uso e a política de privacidade." }),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(PASSWORD_MAX_LENGTH),
});
export type SignInInput = z.input<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });
