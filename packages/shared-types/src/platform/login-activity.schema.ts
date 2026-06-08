import { z } from 'zod';
import {
  LoginFailReasonSchema,
  type LoginFailReason,
  LoginEventStatusSchema,
  type LoginEventStatus,
  UserRoleSchema,
  type UserRole,
} from '../generated/prisma-enums';

export { LoginFailReasonSchema, LoginEventStatusSchema, UserRoleSchema };
export type { LoginFailReason, LoginEventStatus, UserRole };

export const LoginActivityEventSchema = z.object({
  id: z.number(),
  createdAt: z.string(),
  status: LoginEventStatusSchema,
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  deviceLabel: z.string().nullable(),
  deviceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  failReason: LoginFailReasonSchema.nullable(),
  user: z
    .object({
      id: z.number(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      role: UserRoleSchema,
    })
    .nullable(),
  tenant: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
});
export type LoginActivityEvent = z.infer<typeof LoginActivityEventSchema>;

export const ListLoginActivityQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  statuses: z.array(LoginEventStatusSchema).optional(),
  userQuery: z.string().optional(),
  ip: z.string().optional(),
  roles: z.array(z.string()).optional(),
  tenantId: z.number().int().optional(),
  /**
   * Super-Admin-only switch. Excludes `SUPER_ADMIN` users from both the
   * list and summary results so platform-staff browsing doesn't drown
   * out real tenant signal. Ignored by the tenant endpoint.
   */
  excludeSuperAdmin: z.coerce.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListLoginActivityQuery = z.infer<typeof ListLoginActivityQuerySchema>;

export const LoginActivitySummaryQuerySchema = ListLoginActivityQuerySchema.pick({
  from: true,
  to: true,
  tenantId: true,
  roles: true,
  excludeSuperAdmin: true,
});
export type LoginActivitySummaryQuery = z.infer<typeof LoginActivitySummaryQuerySchema>;

const NotableUserCount = z.object({
  userId: z.number(),
  email: z.string(),
  count: z.number(),
  hasOneHourBurst: z.boolean().optional(),
});
const NotableEvent = z.object({
  eventId: z.number(),
  userId: z.number(),
  email: z.string(),
  ip: z.string().nullable(),
  occurredAt: z.string(),
});

export const LoginActivitySummarySchema = z.object({
  kpis: z.object({
    totalSignIns: z.number(),
    failedAttempts: z.number(),
    failedDeltaPct: z.number(),
    uniqueUsers: z.number(),
    uniqueIps: z.number(),
  }),
  notable: z.object({
    bruteForceSuspects: z.array(NotableUserCount),
    newIpSignIns: z.array(NotableEvent),
    offHoursSignIns: z.array(NotableEvent),
  }),
  timezoneUsed: z.string(),
});
export type LoginActivitySummary = z.infer<typeof LoginActivitySummarySchema>;

export const ListLoginActivityResponseSchema = z.object({
  items: z.array(LoginActivityEventSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type ListLoginActivityResponse = z.infer<typeof ListLoginActivityResponseSchema>;
