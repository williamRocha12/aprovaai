import { userProfiles, users, type Database } from "@aprovaai/db";
import type { MeResponse, UpdateProfileInput } from "@aprovaai/shared";
import { eq } from "drizzle-orm";

/** Dados do próprio usuário. Toda função recebe `userId`: não existe leitura sem dono. */
export class MeRepository {
  constructor(private readonly db: Database) {}

  async findMe(userId: string): Promise<MeResponse | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        role: users.role,
        timezone: users.timezone,
        createdAt: users.createdAt,
        displayName: userProfiles.displayName,
        educationLevel: userProfiles.educationLevel,
        interestAreas: userProfiles.interestAreas,
        weeklyAvailability: userProfiles.weeklyAvailability,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId));

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      emailVerified: row.emailVerified,
      role: row.role,
      timezone: row.timezone,
      createdAt: row.createdAt.toISOString(),
      profile: {
        displayName: row.displayName ?? null,
        educationLevel: row.educationLevel ?? null,
        interestAreas: row.interestAreas ?? [],
        weeklyAvailability: row.weeklyAvailability ?? null,
      },
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<void> {
    const { timezone, ...profile } = input;
    await this.db.transaction(async (tx) => {
      if (timezone !== undefined) {
        await tx.update(users).set({ timezone }).where(eq(users.id, userId));
      }
      const changes = Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== undefined));
      if (Object.keys(changes).length > 0) {
        await tx
          .insert(userProfiles)
          .values({ userId, ...changes })
          .onConflictDoUpdate({ target: userProfiles.userId, set: changes });
      }
    });
  }
}
