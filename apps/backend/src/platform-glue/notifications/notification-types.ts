import type { PlatformNotificationType } from '@app/shared-types';

/**
 * YOUR notification types, like the event registry: strings, not a Prisma enum. `notifications.type` and
 * `notification_deliveries.type` are VarChar(60), so a product adds a type here and never edits the foundation
 * schema. The platform's own types are `PLATFORM_NOTIFICATION_TYPES` in `@app/shared-types`.
 *
 *   export const APP_NOTIFICATION_TYPES = ['INVOICE_OVERDUE'] as const;
 *
 * Each type needs a policy in `APP_NOTIFICATION_POLICIES` (app-notification-policies.ts; the compiler holds that,
 * because the map is typed over this list), and both are bound in `platform-glue/hooks.module.ts`. The policy
 * registry refuses to boot when a declared type has no policy, and `notification-policy-parity.spec.ts` holds it in
 * the unit suite. Values are SCREAMING_SNAKE, at most 60 characters, and never repeat a platform type.
 */
export const APP_NOTIFICATION_TYPES = [] as const satisfies readonly string[];

export type AppNotificationType = (typeof APP_NOTIFICATION_TYPES)[number];

/** Every type this app can send: the platform's and its own. */
export type KnownNotificationType = PlatformNotificationType | AppNotificationType;
