import { createHmac } from "node:crypto";
import { loginAttempts, type Database } from "@aprovaai/db";
import { eq } from "drizzle-orm";

export const LOCKOUT_POLICY = {
  /** Falhas seguidas que disparam o bloqueio. */
  maxFailures: 5,
  /** Falhas mais antigas que isso não contam mais. */
  windowMs: 15 * 60_000,
  /** Duração do bloqueio. */
  lockMs: 15 * 60_000,
} as const;
export type LockoutPolicy = typeof LOCKOUT_POLICY;

export interface AttemptState {
  failedCount: number;
  lockedUntil: Date | null;
  lastFailedAt: Date | null;
}

export function isLocked(state: AttemptState | undefined, now: Date): boolean {
  return Boolean(state?.lockedUntil && state.lockedUntil > now);
}

/** Calcula o novo estado após uma falha de login (função pura, testada à parte). */
export function nextStateAfterFailure(
  state: AttemptState | undefined,
  now: Date,
  policy: LockoutPolicy = LOCKOUT_POLICY,
): AttemptState {
  const recent = state?.lastFailedAt && now.getTime() - state.lastFailedAt.getTime() <= policy.windowMs;
  const failedCount = (recent ? (state?.failedCount ?? 0) : 0) + 1;

  if (failedCount >= policy.maxFailures) {
    return { failedCount: 0, lockedUntil: new Date(now.getTime() + policy.lockMs), lastFailedAt: now };
  }
  return { failedCount, lockedUntil: null, lastFailedAt: now };
}

/**
 * Guarda o bloqueio por HMAC do e-mail: um vazamento da tabela não revela quais e-mails
 * tentaram entrar. Funciona igual para e-mails que não existem (sem enumeração).
 */
export class LoginAttemptStore {
  constructor(
    private readonly db: Database,
    private readonly secret: string,
  ) {}

  keyFor(email: string): string {
    return createHmac("sha256", this.secret).update(email.trim().toLowerCase()).digest("hex");
  }

  async get(email: string): Promise<AttemptState | undefined> {
    const [row] = await this.db
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.emailHash, this.keyFor(email)));
    return row;
  }

  /** Registra a falha e devolve se a conta ficou bloqueada. */
  async registerFailure(email: string, now = new Date()): Promise<boolean> {
    const emailHash = this.keyFor(email);
    const next = nextStateAfterFailure(await this.get(email), now);
    await this.db
      .insert(loginAttempts)
      .values({ emailHash, ...next })
      .onConflictDoUpdate({ target: loginAttempts.emailHash, set: next });
    return isLocked(next, now);
  }

  async clear(email: string): Promise<void> {
    await this.db.delete(loginAttempts).where(eq(loginAttempts.emailHash, this.keyFor(email)));
  }
}
