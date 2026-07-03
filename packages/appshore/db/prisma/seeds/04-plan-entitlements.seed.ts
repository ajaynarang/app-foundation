import { PrismaClient, TenantPlan } from '../../generated/client';

/**
 * Plan entitlements — generic platform features, developer platform, limits, display.
 * Add-on features are managed by the AddOn catalog and are NEVER plan entitlements.
 */
const entitlements: {
  plan: TenantPlan;
  feature: string;
  displayName: string;
  enabled: boolean;
  type: 'software' | 'limit' | 'display';
}[] = [
  // ─── TRIAL (full access — matches Enterprise so tenant experiences everything) ──
  // Platform
  {
    plan: TenantPlan.TRIAL,
    feature: 'team_management',
    displayName: 'Team Management',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.TRIAL, feature: 'notifications', displayName: 'Notifications', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'audit_log', displayName: 'Audit Log', enabled: true, type: 'software' },
  // AI
  { plan: TenantPlan.TRIAL, feature: 'ai_chat', displayName: 'AI Chat', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'desk', displayName: 'Desk', enabled: true, type: 'software' },
  { plan: TenantPlan.TRIAL, feature: 'voice_mode', displayName: 'Voice Mode', enabled: true, type: 'software' },
  // Integrations
  { plan: TenantPlan.TRIAL, feature: 'integrations', displayName: 'Integrations', enabled: true, type: 'software' },
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
  { plan: TenantPlan.TRIAL, feature: 'seats_limit', displayName: 'Seats', enabled: true, type: 'limit' },
  { plan: TenantPlan.TRIAL, feature: 'user_limit', displayName: 'Users', enabled: true, type: 'limit' },
  // Support
  { plan: TenantPlan.TRIAL, feature: 'support_level', displayName: 'Priority Support', enabled: true, type: 'display' },
  { plan: TenantPlan.TRIAL, feature: 'sla', displayName: '99.9% SLA', enabled: true, type: 'display' },
  { plan: TenantPlan.TRIAL, feature: 'onboarding', displayName: 'Guided Setup', enabled: true, type: 'display' },

  // ─── STARTER ─────────────────────────────────────────────────────────────
  // Platform
  {
    plan: TenantPlan.STARTER,
    feature: 'team_management',
    displayName: 'Team Management',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.STARTER, feature: 'notifications', displayName: 'Notifications', enabled: true, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'audit_log', displayName: 'Audit Log', enabled: false, type: 'software' },
  // AI
  { plan: TenantPlan.STARTER, feature: 'ai_chat', displayName: 'AI Chat', enabled: true, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'desk', displayName: 'Desk', enabled: true, type: 'software' },
  { plan: TenantPlan.STARTER, feature: 'voice_mode', displayName: 'Voice Mode', enabled: false, type: 'software' },
  // Integrations
  { plan: TenantPlan.STARTER, feature: 'integrations', displayName: 'Integrations', enabled: false, type: 'software' },
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
  { plan: TenantPlan.STARTER, feature: 'seats_limit', displayName: 'Seats', enabled: true, type: 'limit' },
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

  // ─── PROFESSIONAL ────────────────────────────────────────────────────────
  // Platform
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'team_management',
    displayName: 'Team Management',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'notifications',
    displayName: 'Notifications',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.PROFESSIONAL, feature: 'audit_log', displayName: 'Audit Log', enabled: true, type: 'software' },
  // AI
  { plan: TenantPlan.PROFESSIONAL, feature: 'ai_chat', displayName: 'AI Chat', enabled: true, type: 'software' },
  { plan: TenantPlan.PROFESSIONAL, feature: 'desk', displayName: 'Desk', enabled: true, type: 'software' },
  { plan: TenantPlan.PROFESSIONAL, feature: 'voice_mode', displayName: 'Voice Mode', enabled: true, type: 'software' },
  // Integrations
  {
    plan: TenantPlan.PROFESSIONAL,
    feature: 'integrations',
    displayName: 'Integrations',
    enabled: true,
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
  { plan: TenantPlan.PROFESSIONAL, feature: 'seats_limit', displayName: 'Seats', enabled: true, type: 'limit' },
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

  // ─── ENTERPRISE ──────────────────────────────────────────────────────────
  // Platform
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'team_management',
    displayName: 'Team Management',
    enabled: true,
    type: 'software',
  },
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'notifications',
    displayName: 'Notifications',
    enabled: true,
    type: 'software',
  },
  { plan: TenantPlan.ENTERPRISE, feature: 'audit_log', displayName: 'Audit Log', enabled: true, type: 'software' },
  // AI
  { plan: TenantPlan.ENTERPRISE, feature: 'ai_chat', displayName: 'AI Chat', enabled: true, type: 'software' },
  { plan: TenantPlan.ENTERPRISE, feature: 'desk', displayName: 'Desk', enabled: true, type: 'software' },
  { plan: TenantPlan.ENTERPRISE, feature: 'voice_mode', displayName: 'Voice Mode', enabled: true, type: 'software' },
  // Integrations — all enabled
  {
    plan: TenantPlan.ENTERPRISE,
    feature: 'integrations',
    displayName: 'Integrations',
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
  { plan: TenantPlan.ENTERPRISE, feature: 'seats_limit', displayName: 'Seats', enabled: true, type: 'limit' },
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
