import { sessions, users, type Database } from "@aprovaai/db";
import type { AdminUser, UserRole, UserStatus } from "@aprovaai/shared";
import { and, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";

export interface ListUsersFilter {
  page: number;
  pageSize: number;
  search?: string | undefined;
  role?: UserRole | undefined;
  status?: UserStatus | undefined;
}

const adminUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};

function toAdminUser(row: Omit<AdminUser, "createdAt"> & { createdAt: Date }): AdminUser {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/** Escapa curingas do LIKE para a busca não virar padrão. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class AdminUsersRepository {
  constructor(private readonly db: Database) {}

  async list(filter: ListUsersFilter): Promise<{ items: AdminUser[]; total: number }> {
    const conditions: SQL[] = [isNull(users.deletedAt)];
    if (filter.search) {
      const pattern = likePattern(filter.search);
      const searchCondition = or(ilike(users.name, pattern), ilike(users.email, pattern));
      if (searchCondition) conditions.push(searchCondition);
    }
    if (filter.role) conditions.push(eq(users.role, filter.role));
    if (filter.status) conditions.push(eq(users.status, filter.status));
    const where = and(...conditions);

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select(adminUserColumns)
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt), users.id)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ value: count() }).from(users).where(where),
    ]);
    return { items: rows.map(toAdminUser), total: totalRow?.value ?? 0 };
  }

  async findById(id: string): Promise<AdminUser | null> {
    const [row] = await this.db
      .select(adminUserColumns)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return row ? toAdminUser(row) : null;
  }

  async countActiveAdmins(): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active"), isNull(users.deletedAt)));
    return row?.value ?? 0;
  }

  async setRole(id: string, role: UserRole): Promise<void> {
    await this.db.update(users).set({ role }).where(eq(users.id, id));
  }

  /** Desativar também derruba todas as sessões do usuário na hora. */
  async setStatus(id: string, status: UserStatus): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ status }).where(eq(users.id, id));
      if (status === "disabled") await tx.delete(sessions).where(eq(sessions.userId, id));
    });
  }
}
