import * as Sentry from '@sentry/nextjs';

/** Tag keys searchable in Sentry. Values are identifiers only, never names, emails or phones. */
export const SENTRY_TAG = {
  tenant: 'tenant',
  role: 'role',
  requestId: 'requestId',
} as const;

export interface SentryAuthIdentity {
  /** The tenant's public id. */
  tenantId?: string;
  role?: string;
}

/**
 * Tags every later event with the signed-in tenant and role, or clears both on sign-out (an undefined tag value is
 * dropped when the event is serialised). A no-op while Sentry is not initialised.
 */
export function syncSentryAuthTags(identity: SentryAuthIdentity | null): void {
  Sentry.setTags({
    [SENTRY_TAG.tenant]: identity?.tenantId || undefined,
    [SENTRY_TAG.role]: identity?.role || undefined,
  });
}
