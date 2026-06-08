// ---------------------------------------------------------------------------
// @app/shared-types — platform-only barrel (domain-free starter).
// Enums are generated from the Prisma schema (single source of truth) via
// `apps/backend/scripts/generate-shared-enums.ts` → ./generated/prisma-enums.
// ---------------------------------------------------------------------------

// Generated Prisma enum mirror (schema + type + value-bag triple per enum)
export * from './generated/prisma-enums';

// Cross-cutting
export * from './constants';
export * from './database';
export * from './utils/format';
export * from './utils/time';

// Platform domain schemas
export * from './platform/api-key.schema';
export * from './platform/auth.schema';
export * from './platform/user.schema';
export * from './platform/tenant.schema';
export * from './platform/onboarding.schema';
export * from './platform/plans.schema';
export * from './platform/add-ons.schema';
export * from './platform/billing.schema';
export * from './platform/wallet.schema';
export * from './platform/feature-flags.schema';
export * from './platform/preferences.schema';
export * from './platform/conversation.schema';
export * from './platform/oauth.schema';
export * from './platform/feedback.schema';
export * from './platform/login-activity.schema';
export {
  FEATURE_KEYS,
  ADDON_FEATURE_KEYS,
  ENTITLEMENT_FEATURE_KEYS,
  isAddOnFeature,
  isEntitlementFeature,
} from './platform/feature-keys';
export type { FeatureKey } from './platform/feature-keys';

// Infrastructure envelopes
export * from './infrastructure/webhook.schema';
export * from './infrastructure/sse-events';
export * from './infrastructure/job-envelope';

// AI platform schemas
export * from './ai';
