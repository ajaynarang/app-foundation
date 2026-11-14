export const FEATURE_KEYS = {
  /** The WhatsApp channel is a plan feature; the flag is the platform's launch lever. */
  WHATSAPP_NOTIFICATIONS: 'whatsapp_notifications',
  // Plan features (PlanEntitlement rows in 04-plan-entitlements.seed.ts)
  TEAM_MANAGEMENT: 'team_management',
  API_KEYS: 'api_keys',
  WEBHOOKS: 'webhooks',
  OAUTH_CLIENTS: 'oauth_clients',
  AI_CHAT: 'ai_chat',
  VOICE_MODE: 'voice_mode',
  INTEGRATIONS: 'integrations',
  AUDIT_LOG: 'audit_log',
  DESK: 'desk',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

/**
 * Features sold as an add-on (a TenantAddOn row) rather than by plan. Empty: the template has no add-ons service, so
 * `desk` and `audit_log` are plan entitlements, as the seed says. A key added here needs an add-on catalog row
 * (06-add-ons.seed.ts) and an add-on branch in the plan rule; `feature-key-coverage.spec.ts` holds the first.
 */
export const ADDON_FEATURE_KEYS = new Set<string>([]);

export const ENTITLEMENT_FEATURE_KEYS = new Set<string>(
  Object.values(FEATURE_KEYS).filter((k) => !ADDON_FEATURE_KEYS.has(k)),
);

export function isAddOnFeature(key: string): boolean {
  return ADDON_FEATURE_KEYS.has(key);
}

export function isEntitlementFeature(key: string): boolean {
  return ENTITLEMENT_FEATURE_KEYS.has(key);
}
