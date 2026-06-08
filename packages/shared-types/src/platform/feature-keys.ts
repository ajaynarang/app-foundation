export const FEATURE_KEYS = {
  // Core TMS (PlanEntitlement only — never purchasable)
  FLEET_MANAGEMENT: 'fleet_management',
  LOADS_TRACKING: 'loads_tracking',
  CLOSE_OUT: 'close_out',
  BILLING: 'billing',
  DRIVER_PAY: 'driver_pay',
  DRIVER_APP: 'driver_app',
  APP_AI_CHAT: 'sally_ai_chat',
  APP_AI_ACTIONS: 'sally_ai_actions',
  SALLYS_DESK: 'sallys_desk',
  VOICE_MODE: 'voice_mode',
  ALERTS: 'alerts',
  HORIZON: 'horizon',

  // Tier integrations (PlanEntitlement only)
  SAMSARA_INTEGRATION: 'samsara_integration',
  QUICKBOOKS_INTEGRATION: 'quickbooks_integration',
  TMS_INTEGRATION: 'tms_integration',
  LOAD_BOARD: 'load_board',
  CUSTOM_INTEGRATIONS: 'custom_integrations',
  EMAIL_INTAKE: 'email_intake',

  // Developer Platform (PlanEntitlement only — Enterprise)
  API_KEYS: 'api_keys',
  WEBHOOKS: 'webhooks',
  OAUTH_CLIENTS: 'oauth_clients',
  LOGIN_ACTIVITY: 'login_activity',

  // Relay loads (PlanEntitlement — available on Growth+)
  RELAY_LOADS: 'relay_loads',

  // Address autocomplete + auto-mileage on loads (PlanEntitlement — Core TMS, on by default)
  PLACES_AUTOCOMPLETE: 'places_autocomplete',

  // Add-ons (AddOn catalog only — purchasable separately)
  EDI_INTEGRATION: 'edi_integration',
  SHIELD: 'shield',
  ROUTE_PLANNING: 'route_planning',
  DOC_INTELLIGENCE: 'doc_intelligence',
  COMMAND_CENTER: 'command_center',
  IFTA: 'ifta',
  CONTINUOUS_MONITORING: 'continuous_monitoring',
  INSIGHTS: 'insights',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ADDON_FEATURE_KEYS = new Set<string>([
  FEATURE_KEYS.EDI_INTEGRATION,
  FEATURE_KEYS.SHIELD,
  FEATURE_KEYS.ROUTE_PLANNING,
  FEATURE_KEYS.DOC_INTELLIGENCE,
  FEATURE_KEYS.COMMAND_CENTER,
  FEATURE_KEYS.IFTA,
  FEATURE_KEYS.CONTINUOUS_MONITORING,
  FEATURE_KEYS.INSIGHTS,
]);

export const ENTITLEMENT_FEATURE_KEYS = new Set<string>(
  Object.values(FEATURE_KEYS).filter((k) => !ADDON_FEATURE_KEYS.has(k)),
);

export function isAddOnFeature(key: string): boolean {
  return ADDON_FEATURE_KEYS.has(key);
}

export function isEntitlementFeature(key: string): boolean {
  return ENTITLEMENT_FEATURE_KEYS.has(key);
}
