import { z } from "zod";

export const USER_ROLES = ["user", "editor", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const EDUCATION_LEVELS = ["fundamental", "medio", "superior"] as const;
export const educationLevelSchema = z.enum(EDUCATION_LEVELS);

export const WEEK_DAYS = ["0", "1", "2", "3", "4", "5", "6"] as const;

/** Até 16h por dia; o motor de planejamento trata zero horas com mensagem própria. */
const dayMinutes = z
  .number()
  .int()
  .min(0)
  .max(16 * 60);

export const weeklyAvailabilitySchema = z.object({
  "0": dayMinutes,
  "1": dayMinutes,
  "2": dayMinutes,
  "3": dayMinutes,
  "4": dayMinutes,
  "5": dayMinutes,
  "6": dayMinutes,
});
export type WeeklyAvailability = z.infer<typeof weeklyAvailabilitySchema>;

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).nullable().optional(),
  educationLevel: educationLevelSchema.nullable().optional(),
  interestAreas: z.array(z.string().trim().min(2).max(60)).max(20).optional(),
  weeklyAvailability: weeklyAvailabilitySchema.nullable().optional(),
  timezone: z
    .string()
    .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Fuso horário inválido.")
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: userRoleSchema,
  timezone: z.string(),
  createdAt: z.string(),
  profile: z.object({
    displayName: z.string().nullable(),
    educationLevel: educationLevelSchema.nullable(),
    interestAreas: z.array(z.string()),
    weeklyAvailability: weeklyAvailabilitySchema.nullable(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// --- Admin ---

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminListUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  role: userRoleSchema.optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const adminUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: userRoleSchema,
  status: z.enum(USER_STATUSES),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUpdateRoleSchema = z.object({ role: userRoleSchema });
export const adminUpdateStatusSchema = z.object({ status: z.enum(USER_STATUSES) });

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}
