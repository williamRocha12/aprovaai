import { describe, expect, it } from "vitest";
import { LOCKOUT_POLICY, isLocked, nextStateAfterFailure, type AttemptState } from "./lockout";

const t0 = new Date("2026-10-27T12:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("nextStateAfterFailure", () => {
  it("primeira falha conta 1 e não bloqueia", () => {
    const state = nextStateAfterFailure(undefined, t0);
    expect(state.failedCount).toBe(1);
    expect(isLocked(state, t0)).toBe(false);
  });

  it(`bloqueia na ${LOCKOUT_POLICY.maxFailures}ª falha dentro da janela`, () => {
    let state: AttemptState | undefined;
    for (let i = 0; i < LOCKOUT_POLICY.maxFailures; i++) state = nextStateAfterFailure(state, minutes(i));
    expect(isLocked(state, minutes(LOCKOUT_POLICY.maxFailures))).toBe(true);
  });

  it("o bloqueio expira depois de lockMs", () => {
    let state: AttemptState | undefined;
    for (let i = 0; i < LOCKOUT_POLICY.maxFailures; i++) state = nextStateAfterFailure(state, t0);
    expect(isLocked(state, minutes(14))).toBe(true);
    expect(isLocked(state, minutes(16))).toBe(false);
  });

  it("falhas antigas (fora da janela) não somam", () => {
    const old: AttemptState = { failedCount: 4, lockedUntil: null, lastFailedAt: t0 };
    const state = nextStateAfterFailure(old, minutes(16));
    expect(state.failedCount).toBe(1);
    expect(isLocked(state, minutes(16))).toBe(false);
  });

  it("estado inexistente não está bloqueado", () => {
    expect(isLocked(undefined, t0)).toBe(false);
  });
});
