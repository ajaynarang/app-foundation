import { PrismaClient } from '@prisma/client';

/**
 * Feature flags — operational kill-switches for every platform feature key.
 * All enabled=true by default (the add-on/entitlement system gates access, not flags).
 */
const flags = [
  // Core platform
  {
    key: 'team_management',
    name: 'Team Management',
    description: 'Invite, manage, and assign roles to members of a workspace',
    enabled: true,
    category: 'core',
  },
  {
    key: 'notifications',
    name: 'Notifications',
    description: 'In-app, email, and push notifications for important events',
    enabled: true,
    category: 'core',
  },
  {
    key: 'audit_log',
    name: 'Audit Log',
    description: 'Track key actions across the workspace for security and compliance',
    enabled: true,
    category: 'operations',
  },

  // AI
  {
    key: 'ai_chat',
    name: 'AI Chat',
    description: 'AI chat assistant for everyday workspace tasks',
    enabled: true,
    category: 'ai',
  },
  {
    key: 'voice_mode',
    name: 'Voice Mode',
    description: 'Speech-to-text and text-to-speech for hands-free interaction',
    enabled: true,
    category: 'ai',
  },
  {
    key: 'desk',
    name: 'Desk',
    description: 'AI workflow automation',
    enabled: true,
    category: 'ai',
  },

  // Integrations
  {
    key: 'integrations',
    name: 'Integrations',
    description: 'Connect third-party services to the platform',
    enabled: true,
    category: 'integration',
  },

  // Developer Platform
  {
    key: 'api_keys',
    name: 'API Keys',
    description: 'API key management for programmatic access',
    enabled: true,
    category: 'developer',
  },
  {
    key: 'webhooks',
    name: 'Webhooks',
    description: 'Outbound webhook subscriptions for event notifications',
    enabled: true,
    category: 'developer',
  },
  {
    key: 'oauth_clients',
    name: 'OAuth Clients',
    description: 'OAuth 2.0 client management for third-party apps',
    enabled: true,
    category: 'developer',
  },
  {
    key: 'login_activity',
    name: 'Login Activity',
    description: 'Admin sign-in audit pages (Super Admin + Tenant) with device, IP, and failure reason',
    enabled: true,
    category: 'developer',
  },

  // Billing
  {
    key: 'payment_system',
    name: 'Payment System',
    description: 'Self-service plan subscriptions, wallet top-ups, and payment method management via Stripe',
    enabled: true,
    category: 'money',
  },
];

export const seed = {
  name: 'Feature Flags',
  description: `Creates ${flags.length} feature flags as operational kill-switches`,

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Remove old flags that no longer exist
    const validKeys = flags.map((f) => f.key);
    await prisma.featureFlag.deleteMany({
      where: { key: { notIn: validKeys } },
    });

    for (const flag of flags) {
      const result = await prisma.featureFlag.upsert({
        where: { key: flag.key },
        update: { name: flag.name, description: flag.description, category: flag.category },
        create: flag,
      });

      const isNew = new Date().getTime() - result.createdAt.getTime() < 5000;
      if (isNew) created++;
      else skipped++;
    }

    return { created, skipped };
  },
};
