import { z } from 'zod';

/**
 * Notification types are strings with an app registry, not a Prisma enum: `notifications.type` and
 * `notification_deliveries.type` are VarChar(60). This list is the platform's own types; an app declares its own in
 * `apps/backend/src/platform-glue/notifications/notification-types.ts`, bound to the platform's `NOTIFICATION_TYPES`
 * token, and the policy registry refuses to boot when a declared type has no policy. Held by
 * `__tests__/notification-types.spec.ts` and the backend's `notification-policy-parity.spec.ts`.
 */
export const PLATFORM_NOTIFICATION_TYPES = [
  // Platform
  'USER_INVITATION',
  'TENANT_REGISTRATION_CONFIRMATION',
  'TENANT_APPROVED',
  'TENANT_REJECTED',
  // System
  'INTEGRATION_SYNC_COMPLETED',
  'INTEGRATION_SYNC_FAILED',
  'SETTINGS_UPDATED',
  // AI
  'AI_BUDGET_REACHED',
  'AI_CREDENTIAL_FAILING',
  // Team
  'USER_JOINED',
  'ROLE_CHANGED',
] as const;

export type PlatformNotificationType = (typeof PLATFORM_NOTIFICATION_TYPES)[number];

function valueBag<const T extends readonly string[]>(list: T): { readonly [K in T[number]]: K } {
  return Object.fromEntries(list.map((value) => [value, value])) as { readonly [K in T[number]]: K };
}

/** Value access to the platform's types: `PlatformNotificationType.USER_INVITATION`. */
export const PlatformNotificationType = valueBag(PLATFORM_NOTIFICATION_TYPES);

/** The longest type the `type` columns hold. */
export const NOTIFICATION_TYPE_MAX_LENGTH = 60;

/**
 * A notification type on the wire or in a column: a platform type or an app's, SCREAMING_SNAKE, at most 60
 * characters. Which strings are declared is the backend registry's job, not this schema's.
 */
export const NotificationTypeSchema = z
  .string()
  .min(1)
  .max(NOTIFICATION_TYPE_MAX_LENGTH)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export type NotificationType = z.infer<typeof NotificationTypeSchema>;
