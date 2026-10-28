import { auditLogs, type Database } from "@aprovaai/db";

export const AUDIT_ACTIONS = {
  SIGN_UP: "auth.sign_up",
  SIGN_IN: "auth.sign_in",
  SIGN_IN_FAILED: "auth.sign_in_failed",
  SIGN_IN_LOCKED: "auth.sign_in_locked",
  SIGN_OUT: "auth.sign_out",
  SIGN_OUT_ALL: "auth.sign_out_all",
  EMAIL_VERIFIED: "auth.email_verified",
  PASSWORD_RESET_REQUESTED: "auth.password_reset_requested",
  PASSWORD_RESET: "auth.password_reset",
  PASSWORD_CHANGED: "auth.password_changed",
  ROLE_CHANGED: "admin.user_role_changed",
  STATUS_CHANGED: "admin.user_status_changed",
  FEATURE_FLAG_CHANGED: "admin.feature_flag_changed",
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  /** Nunca colocar senha, token ou e-mail em claro aqui. */
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAudit(db: Database, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
    ipAddress: entry.ipAddress ?? null,
  });
}
