import { z } from 'zod';
import {
  LoginFailReasonSchema,
  type LoginFailReason,
  LoginEventStatusSchema,
  type LoginEventStatus,
  UserRoleSchema,
  type UserRole,
} from '../generated/prisma-enums';
import { cursorListSchema } from '../infrastructure/cursor-list';

export { LoginFailReasonSchema, LoginEventStatusSchema, UserRoleSchema };
export type { LoginFailReason, LoginEventStatus, UserRole };

export const LoginActivityEventSchema = z.object({
  /** Public id (uuid): the list cursor tiebreak. */
  publicId: z.string(),
  /** Numeric id (listed in the id-boundary allowlist: the Notable panel's `eventId`); never in a cursor. */
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
  /** Page size: clamped to 1…100 by the service; 50 when missing. */
  limit: z.number().int().optional(),
  /** `nextCursor` of the previous page. */
  cursor: z.string().optional(),
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

/** `GET /admin/login-activity` and `/super-admin/login-activity`: a cursor list, newest first. */
export const ListLoginActivityResponseSchema = cursorListSchema(LoginActivityEventSchema);
export type ListLoginActivityResponse = z.infer<typeof ListLoginActivityResponseSchema>;
