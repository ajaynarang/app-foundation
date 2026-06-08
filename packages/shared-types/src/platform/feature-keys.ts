export const FEATURE_KEYS = {
  // Core platform (PlanEntitlement only — never purchasable)
  TEAM_MANAGEMENT: 'team_management',
  API_KEYS: 'api_keys',
  WEBHOOKS: 'webhooks',
  OAUTH_CLIENTS: 'oauth_clients',
  AI_CHAT: 'ai_chat',
  VOICE_MODE: 'voice_mode',
  INTEGRATIONS: 'integrations',

  // Add-ons (AddOn catalog only — purchasable separately)
  AUDIT_LOG: 'audit_log',
  DESK: 'desk',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ADDON_FEATURE_KEYS = new Set<string>([FEATURE_KEYS.AUDIT_LOG, FEATURE_KEYS.DESK]);

export const ENTITLEMENT_FEATURE_KEYS = new Set<string>(
  Object.values(FEATURE_KEYS).filter((k) => !ADDON_FEATURE_KEYS.has(k)),
);

export function isAddOnFeature(key: string): boolean {
  return ADDON_FEATURE_KEYS.has(key);
}

export function isEntitlementFeature(key: string): boolean {
  return ENTITLEMENT_FEATURE_KEYS.has(key);
}
