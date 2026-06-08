import { PrismaClient, TenantPlan } from '@prisma/client';

/**
 * Plan entitlements — ONLY core TMS features, tier integrations, developer platform, limits, display.
 * Add-on features (EDI, Shield, Route Planning, Doc Intelligence, Command Center, IFTA,
 * Continuous Monitoring, Insights) are managed by the AddOn catalog and are NEVER plan entitlements.
 */
const entitlements: {
  plan: TenantPlan;
  feature: string;
  displayName: string;
  enabled: boolean;
  type: 'software' | 'limit' | 'display';
}[] = [
  // ─── TRIAL (full access — matches Enterprise so tenant experiences everything) ──
  // Core TMS
  {
    plan: TenantPlan.TRIAL,
    feature: 'fleet_management',
    displayName: 'Fleet Management',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.TRIAL,
    feature: 'loads_tracking',
    displayName: 'Loads & Tracking',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.TRIAL, feature: 'close_out', displayName: 'Close Out', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'billing', displayName: 'Billing & Invoicing', enabled: true, type: 'software' },
  {
    plan: TenantPlan.TRIAL,
    feature: 'driver_pay',
    displayName: 'Driver Pay & Settlements',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.TRIAL, feature: 'driver_app', displayName: 'Driver App', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'relay_loads', displayName: 'Relay Loads', enabled: true, type: 'software' },
  // Sally AI
  { plan: TenantPlan.TRIAL, feature: 'sally_ai_chat', displayName: 'Sally AI Chat', enabled: true, type: 'software' },
  {
    plan: TenantPlan.TRIAL,
    feature: 'sally_ai_actions',
    displayName: 'Sally AI Actions',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.TRIAL, feature: 'sallys_desk', displayName: "Sally's Desk", enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'voice_mode', displayName: 'Voice Mode', enabled: true, type: 'software' },
  // Alerts
  { plan: TenantPlan.TRIAL, feature: 'alerts', displayName: 'Alerts System', enabled: true, type: 'software' },
  // Horizon
  { plan: TenantPlan.TRIAL, feature: 'horizon', displayName: 'Horizon Fleet Planner', enabled: true, type: 'software' },
  // Integrations — all enabled for trial
  {
    plan: TenantPlan.TRIAL,
    feature: 'samsara_integration',
    displayName: 'Samsara Integration',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.TRIAL,
    feature: 'quickbooks_integration',
    displayName: 'QuickBooks Integration',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.TRIAL,
    feature: 'tms_integration',
    displayName: 'TMS Integration',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.TRIAL, feature: 'load_board', displayName: 'Load Board', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'email_intake', displayName: 'Email Intake', enabled: true, type: 'software' },
  {
    plan: TenantPlan.TRIAL,
    feature: 'custom_integrations',
    displayName: 'Custom Integrations',
    enabled: true,
    type: 'software',
  },
  // Developer Platform — enabled for trial
  { plan: TenantPlan.TRIAL, feature: 'api_keys', displayName: 'API Keys', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'webhooks', displayName: 'Webhooks', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'oauth_clients', displayName: 'OAuth Clients', enabled: true, type: 'software' },
  {
    plan: TenantPlan.TRIAL,
    feature: 'login_activity',
    displayName: 'Login Activity',
    enabled: true,
    type: 'software',
  },
  // Limits
  { plan: TenantPlan.TRIAL, feature: 'fleet_limit', displayName: 'Fleet Size', enabled: true, type: 'limit' },
  { plan: TenantPlan.TRIAL, feature: 'user_limit', displayName: 'Users', enabled: true, type: 'limit' },
  // Support
  { plan: TenantPlan.TRIAL, feature: 'support_level', displayName: 'Priority Support', enabled: true, type: 'display' },
  { plan: TenantPlan.TRIAL, feature: 'sla', displayName: '99.9% SLA', enabled: true, type: 'display' },
  { plan: TenantPlan.TRIAL, feature: 'onboarding', displayName: 'Guided Setup', enabled: true, type: 'display' },

  // ─── STARTER (Haul) ──────────────────────────────────────────────────────
  // Core TMS
  {
    plan: TenantPlan.STARTER,
    feature: 'fleet_management',
    displayName: 'Fleet Management',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.STARTER,
    feature: 'loads_tracking',
    displayName: 'Loads & Tracking',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.STARTER, feature: 'close_out', displayName: 'Close Out', enabled: true, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'billing', displayName: 'Billing & Invoicing', enabled: true, type: 'software' },
  {
    plan: TenantPlan.STARTER,
    feature: 'driver_pay',
    displayName: 'Driver Pay & Settlements',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.STARTER, feature: 'driver_app', displayName: 'Driver App', enabled: true, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'relay_loads', displayName: 'Relay Loads', enabled: true, type: 'software' },
  // Sally AI
  { plan: TenantPlan.STARTER, feature: 'sally_ai_chat', displayName: 'Sally AI Chat', enabled: true, type: 'software' },
  {
    plan: TenantPlan.STARTER,
    feature: 'sally_ai_actions',
    displayName: 'Sally AI Actions',
    enabled: false,
    type: 'software',
  },
  { plan: TenantPlan.STARTER, feature: 'sallys_desk', displayName: "Sally's Desk", enabled: true, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'voice_mode', displayName: 'Voice Mode', enabled: false, type: 'software' },
  // Alerts
  { plan: TenantPlan.STARTER, feature: 'alerts', displayName: 'Alerts System', enabled: false, type: 'software' },
  // Horizon
  {
    plan: TenantPlan.STARTER,
    feature: 'horizon',
    displayName: 'Horizon Fleet Planner',
    enabled: true,
    type: 'software',
  },
  // Integrations
  {
    plan: TenantPlan.STARTER,
    feature: 'samsara_integration',
    displayName: 'Samsara Integration',
    enabled: false,
    type: 'software',
  },
  {
    plan: TenantPlan.STARTER,
    feature: 'quickbooks_integration',
    displayName: 'QuickBooks Integration',
    enabled: false,
    type: 'software',
  },
  {
    plan: TenantPlan.STARTER,
    feature: 'tms_integration',
    displayName: 'TMS Integration',
    enabled: false,
    type: 'software',
  },
  { plan: TenantPlan.STARTER, feature: 'load_board', displayName: 'Load Board', enabled: false, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'email_intake', displayName: 'Email Intake', enabled: true, type: 'software' },
  {
    plan: TenantPlan.STARTER,
    feature: 'custom_integrations',
    displayName: 'Custom Integrations',
    enabled: false,
    type: 'software',
  },
  // Developer Platform
  { plan: TenantPlan.STARTER, feature: 'api_keys', displayName: 'API Keys', enabled: false, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'webhooks', displayName: 'Webhooks', enabled: false, type: 'software' },
  {
    plan: TenantPlan.STARTER,
    feature: 'oauth_clients',
    displayName: 'OAuth Clients',
    enabled: false,
    type: 'software',
  },
  {
    plan: TenantPlan.STARTER,
    feature: 'login_activity',
    displayName: 'Login Activity',
    enabled: true,
    type: 'software',
  },
  // Limits
  { plan: TenantPlan.STARTER, feature: 'fleet_limit', displayName: 'Fleet Size', enabled: true, type: 'limit' },
  { plan: TenantPlan.STARTER, feature: 'user_limit', displayName: 'Users', enabled: true, type: 'limit' },
  // Support
  {
    plan: TenantPlan.STARTER,
    feature: 'support_level',
    displayName: 'Community + Docs',
    enabled: true,
    type: 'display',
  },
  { plan: TenantPlan.STARTER, feature: 'onboarding', displayName: 'Self-serve', enabled: true, type: 'display' },

  // ─── PROFESSIONAL (Fleet) ─────────────────────────────────────────────────
  // Core TMS
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'fleet_management',
    displayName: 'Fleet Management',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'loads_tracking',
    displayName: 'Loads & Tracking',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.PROFESSIONAL, feature: 'close_out', displayName: 'Close Out', enabled: true, type: 'software' },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'billing',
    displayName: 'Billing & Invoicing',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'driver_pay',
    displayName: 'Driver Pay & Settlements',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.PROFESSIONAL, feature: 'driver_app', displayName: 'Driver App', enabled: true, type: 'software' },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'relay_loads',
    displayName: 'Relay Loads',
    enabled: true,
    type: 'software',
  },
  // Sally AI
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'sally_ai_chat',
    displayName: 'Sally AI Chat',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'sally_ai_actions',
    displayName: 'Sally AI Actions',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'sallys_desk',
    displayName: "Sally's Desk",
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.PROFESSIONAL, feature: 'voice_mode', displayName: 'Voice Mode', enabled: true, type: 'software' },
  // Alerts
  { plan: TenantPlan.PROFESSIONAL, feature: 'alerts', displayName: 'Alerts System', enabled: true, type: 'software' },
  // Horizon
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'horizon',
    displayName: 'Horizon Fleet Planner',
    enabled: true,
    type: 'software',
  },
  // Integrations
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'samsara_integration',
    displayName: 'Samsara Integration',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'quickbooks_integration',
    displayName: 'QuickBooks Integration',
    enabled: false,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'tms_integration',
    displayName: 'TMS Integration',
    enabled: false,
    type: 'software',
  },
  { plan: TenantPlan.PROFESSIONAL, feature: 'load_board', displayName: 'Load Board', enabled: true, type: 'software' },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'email_intake',
    displayName: 'Email Intake',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'custom_integrations',
    displayName: 'Custom Integrations',
    enabled: false,
    type: 'software',
  },
  // Developer Platform
  { plan: TenantPlan.PROFESSIONAL, feature: 'api_keys', displayName: 'API Keys', enabled: false, type: 'software' },
  { plan: TenantPlan.PROFESSIONAL, feature: 'webhooks', displayName: 'Webhooks', enabled: false, type: 'software' },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'oauth_clients',
    displayName: 'OAuth Clients',
    enabled: false,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'login_activity',
    displayName: 'Login Activity',
    enabled: true,
    type: 'software',
  },
  // Limits
  { plan: TenantPlan.PROFESSIONAL, feature: 'fleet_limit', displayName: 'Fleet Size', enabled: true, type: 'limit' },
  { plan: TenantPlan.PROFESSIONAL, feature: 'user_limit', displayName: 'Users', enabled: true, type: 'limit' },
  // Support
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'support_level',
    displayName: 'Email Support',
    enabled: true,
    type: 'display',
  },
  { plan: TenantPlan.PROFESSIONAL, feature: 'sla', displayName: '99.5% SLA', enabled: true, type: 'display' },
  { plan: TenantPlan.PROFESSIONAL, feature: 'onboarding', displayName: 'Guided Setup', enabled: true, type: 'display' },

  // ─── ENTERPRISE (Freight Force) ────────────────────────────────────────────
  // Core TMS
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'fleet_management',
    displayName: 'Fleet Management',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'loads_tracking',
    displayName: 'Loads & Tracking',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.ENTERPRISE, feature: 'close_out', displayName: 'Close Out', enabled: true, type: 'software' },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'billing',
    displayName: 'Billing & Invoicing',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'driver_pay',
    displayName: 'Driver Pay & Settlements',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.ENTERPRISE, feature: 'driver_app', displayName: 'Driver App', enabled: true, type: 'software' },
  { plan: TenantPlan.ENTERPRISE, feature: 'relay_loads', displayName: 'Relay Loads', enabled: true, type: 'software' },
  // Sally AI
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'sally_ai_chat',
    displayName: 'Sally AI Chat',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'sally_ai_actions',
    displayName: 'Sally AI Actions',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.ENTERPRISE, feature: 'sallys_desk', displayName: "Sally's Desk", enabled: true, type: 'software' },
  { plan: TenantPlan.ENTERPRISE, feature: 'voice_mode', displayName: 'Voice Mode', enabled: true, type: 'software' },
  // Alerts
  { plan: TenantPlan.ENTERPRISE, feature: 'alerts', displayName: 'Alerts System', enabled: true, type: 'software' },
  // Horizon
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'horizon',
    displayName: 'Horizon Fleet Planner',
    enabled: true,
    type: 'software',
  },
  // Integrations — all enabled
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'samsara_integration',
    displayName: 'Samsara Integration',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'quickbooks_integration',
    displayName: 'QuickBooks Integration',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'tms_integration',
    displayName: 'TMS Integration',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.ENTERPRISE, feature: 'load_board', displayName: 'Load Board', enabled: true, type: 'software' },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'email_intake',
    displayName: 'Email Intake',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'custom_integrations',
    displayName: 'Custom Integrations',
    enabled: true,
    type: 'software',
  },
  // Developer Platform — enabled
  { plan: TenantPlan.ENTERPRISE, feature: 'api_keys', displayName: 'API Keys', enabled: true, type: 'software' },
  { plan: TenantPlan.ENTERPRISE, feature: 'webhooks', displayName: 'Webhooks', enabled: true, type: 'software' },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'login_activity',
    displayName: 'Login Activity',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'oauth_clients',
    displayName: 'OAuth Clients',
    enabled: true,
    type: 'software',
  },
  // Limits
  { plan: TenantPlan.ENTERPRISE, feature: 'fleet_limit', displayName: 'Fleet Size', enabled: true, type: 'limit' },
  { plan: TenantPlan.ENTERPRISE, feature: 'user_limit', displayName: 'Users', enabled: true, type: 'limit' },
  // Support
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'support_level',
    displayName: 'Priority + CSM',
    enabled: true,
    type: 'display',
  },
  { plan: TenantPlan.ENTERPRISE, feature: 'sla', displayName: '99.9% SLA', enabled: true, type: 'display' },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'onboarding',
    displayName: 'Dedicated Onboarding',
    enabled: true,
    type: 'display',
  },
];

export const seed = {
  name: 'Plan Entitlements',
  description: `Creates ${entitlements.length} plan entitlement mappings across 4 tiers (add-on features excluded)`,

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Remove old entitlements that no longer exist (including old add-on features)
    const validPairs = entitlements.map((e) => `${e.plan}:${e.feature}`);
    const existing = await prisma.planEntitlement.findMany();
    for (const e of existing) {
      if (!validPairs.includes(`${e.plan}:${e.feature}`)) {
        await prisma.planEntitlement.delete({ where: { id: e.id } });
      }
    }

    for (const entitlement of entitlements) {
      const found = await prisma.planEntitlement.findUnique({
        where: { plan_feature: { plan: entitlement.plan, feature: entitlement.feature } },
      });

      if (found) {
        await prisma.planEntitlement.update({
          where: { plan_feature: { plan: entitlement.plan, feature: entitlement.feature } },
          data: { enabled: entitlement.enabled, displayName: entitlement.displayName, type: entitlement.type },
        });
        skipped++;
      } else {
        await prisma.planEntitlement.create({ data: entitlement });
        created++;
      }
    }

    return { created, skipped };
  },
};
