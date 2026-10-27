import {
  accounts,
  consents,
  featureFlags,
  rateLimits,
  sessions,
  userProfiles,
  users,
  verifications,
  type Database,
} from "@aprovaai/db";
import { LEGAL_DOCS_VERSION, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@aprovaai/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config";
import { AUDIT_ACTIONS, recordAudit } from "../lib/audit";
import { clientIpFrom } from "../lib/client-ip";
import { resetPasswordEmail, verificationEmail } from "../lib/email/templates";
import type { EmailMessage, EmailProvider } from "../lib/email/types";
import { LoginAttemptStore } from "./lockout";
import { hashPassword, verifyPassword } from "./password";

export interface AuthDeps {
  config: AppConfig;
  db: Database;
  email: EmailProvider;
  logger: FastifyBaseLogger;
}

export const AUTH_BASE_PATH = "/api/auth";

/** Lê o e-mail do corpo da requisição de login sem confiar no formato. */
function bodyEmail(body: unknown): string | null {
  if (body && typeof body === "object" && "email" in body && typeof body.email === "string") {
    return body.email;
  }
  return null;
}

export function createAuth({ config, db, email, logger }: AuthDeps) {
  const attempts = new LoginAttemptStore(db, config.BETTER_AUTH_SECRET);
  const clientIp = (request: Request | undefined) =>
    clientIpFrom((name) => request?.headers.get(name), config.CLIENT_IP_HEADER);

  // Envio sem `await` no fluxo de auth: o tempo de resposta não pode revelar se o e-mail existe.
  const sendInBackground = (message: EmailMessage, kind: string) => {
    email.send(message).catch((err: unknown) => logger.error({ err, kind }, "falha ao enviar e-mail"));
  };

  return betterAuth({
    appName: "AprovaAI",
    baseURL: config.APP_URL,
    basePath: AUTH_BASE_PATH,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: config.trustedOrigins,
    telemetry: { enabled: false },

    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),

    advanced: {
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: config.CLIENT_IP_HEADER ? [config.CLIENT_IP_HEADER] : [] },
      cookiePrefix: "aprovaai",
      useSecureCookies: config.isProduction,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: config.isProduction },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 dias
      updateAge: 60 * 60 * 24, // renova a expiração no máximo 1x por dia
    },

    rateLimit: {
      enabled: config.RATE_LIMIT_ENABLED,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: false,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 60 * 30, // 30 minutos
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        sendInBackground(resetPasswordEmail(user.email, user.name, url), "reset_password");
        await recordAudit(db, {
          action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
          actorUserId: user.id,
          ipAddress: clientIp(request),
        });
      },
      onPasswordReset: async ({ user }, request) => {
        await attempts.clear(user.email);
        await recordAudit(db, {
          action: AUDIT_ACTIONS.PASSWORD_RESET,
          actorUserId: user.id,
          ipAddress: clientIp(request),
        });
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24 horas
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(verificationEmail(user.email, user.name, url), "verify_email");
      },
      afterEmailVerification: async (user, request) => {
        await recordAudit(db, {
          action: AUDIT_ACTIONS.EMAIL_VERIFIED,
          actorUserId: user.id,
          ipAddress: clientIp(request),
        });
      },
    },

    // Login Google só existe se as credenciais estiverem configuradas; a flag decide se está ativo.
    ...(config.googleConfigured
      ? {
          socialProviders: {
            google: {
              clientId: config.GOOGLE_CLIENT_ID ?? "",
              clientSecret: config.GOOGLE_CLIENT_SECRET ?? "",
            },
          },
        }
      : {}),

    databaseHooks: {
      user: {
        create: {
          // Perfil vazio + aceite dos termos na mesma hora do cadastro.
          after: async (user, ctx) => {
            const ip = clientIp(ctx?.request);
            await db.insert(userProfiles).values({ userId: user.id }).onConflictDoNothing();
            await db.insert(consents).values([
              {
                userId: user.id,
                document: "terms",
                version: LEGAL_DOCS_VERSION,
                accepted: true,
                ipAddress: ip,
              },
              {
                userId: user.id,
                document: "privacy",
                version: LEGAL_DOCS_VERSION,
                accepted: true,
                ipAddress: ip,
              },
            ]);
            await recordAudit(db, { action: AUDIT_ACTIONS.SIGN_UP, actorUserId: user.id, ipAddress: ip });
          },
        },
      },
      session: {
        create: {
          // Conta desativada ou excluída não ganha sessão nova.
          before: async (session) => {
            const [owner] = await db
              .select({ status: users.status, deletedAt: users.deletedAt })
              .from(users)
              .where(eq(users.id, session.userId));
            if (!owner || owner.status !== "active" || owner.deletedAt) {
              throw new APIError("FORBIDDEN", { message: "Conta desativada.", code: "ACCOUNT_DISABLED" });
            }
          },
        },
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          const body = ctx.body as Record<string, unknown> | undefined;
          if (body?.acceptTerms !== true) {
            throw new APIError("BAD_REQUEST", {
              message: "É preciso aceitar os termos de uso e a política de privacidade.",
              code: "TERMS_NOT_ACCEPTED",
            });
          }
        }

        if (ctx.path === "/sign-in/email") {
          const emailValue = bodyEmail(ctx.body);
          if (
            emailValue &&
            (await attempts.get(emailValue).then((s) => s?.lockedUntil && s.lockedUntil > new Date()))
          ) {
            await recordAudit(db, { action: AUDIT_ACTIONS.SIGN_IN_LOCKED, ipAddress: clientIp(ctx.request) });
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
              code: "LOGIN_LOCKED",
            });
          }
        }

        if (ctx.path.startsWith("/sign-in/social")) {
          const [flag] = await db
            .select({ enabled: featureFlags.enabled })
            .from(featureFlags)
            .where(eq(featureFlags.key, "google_login"));
          if (!flag?.enabled) {
            throw new APIError("NOT_FOUND", {
              message: "Login social desativado.",
              code: "SOCIAL_LOGIN_DISABLED",
            });
          }
        }

        if (ctx.path === "/sign-out" || ctx.path === "/revoke-sessions") {
          const current = await getSessionFromCtx(ctx);
          if (current) {
            await recordAudit(db, {
              action: ctx.path === "/sign-out" ? AUDIT_ACTIONS.SIGN_OUT : AUDIT_ACTIONS.SIGN_OUT_ALL,
              actorUserId: current.user.id,
              ipAddress: clientIp(ctx.request),
            });
          }
        }
      }),

      after: createAuthMiddleware(async (ctx) => {
        const ip = clientIp(ctx.request);

        if (ctx.path === "/sign-in/email") {
          const emailValue = bodyEmail(ctx.body);
          const newSession = ctx.context.newSession;
          if (newSession) {
            if (emailValue) await attempts.clear(emailValue);
            await recordAudit(db, {
              action: AUDIT_ACTIONS.SIGN_IN,
              actorUserId: newSession.user.id,
              ipAddress: ip,
            });
            return;
          }
          // Só conta como falha credencial inválida (401); e-mail não verificado não é tentativa errada.
          const returned = ctx.context.returned;
          if (emailValue && returned instanceof APIError && returned.statusCode === 401) {
            const locked = await attempts.registerFailure(emailValue);
            await recordAudit(db, {
              action: locked ? AUDIT_ACTIONS.SIGN_IN_LOCKED : AUDIT_ACTIONS.SIGN_IN_FAILED,
              ipAddress: ip,
            });
          }
        }

        if (ctx.path === "/change-password" && !(ctx.context.returned instanceof APIError)) {
          const userId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id;
          if (userId)
            await recordAudit(db, {
              action: AUDIT_ACTIONS.PASSWORD_CHANGED,
              actorUserId: userId,
              ipAddress: ip,
            });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
