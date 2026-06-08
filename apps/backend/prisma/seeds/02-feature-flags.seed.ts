import { PrismaClient } from '@prisma/client';

/**
 * Feature flags — operational kill-switches for every feature key.
 * Maps 1:1 with FEATURE_KEYS from @app/shared-types.
 * All enabled=true by default (the add-on/entitlement system gates access, not flags).
 */
const flags = [
  // Core TMS
  {
    key: 'fleet_management',
    name: 'Fleet Management',
    description: 'Core fleet management (drivers, vehicles)',
    enabled: true,
    category: 'core',
  },
  {
    key: 'loads_tracking',
    name: 'Loads & Tracking',
    description: 'Load creation, assignment, tracking, and status',
    enabled: true,
    category: 'core',
  },
  {
    key: 'close_out',
    name: 'Close Out',
    description: 'Review delivered loads, verify documents, and approve for billing',
    enabled: true,
    category: 'money',
  },
  {
    key: 'billing',
    name: 'Billing',
    description: 'Invoice generation, sending, and tracking with automatic rate calculation',
    enabled: true,
    category: 'money',
  },
  {
    key: 'driver_pay',
    name: 'Driver Pay',
    description: 'Settlement calculation with per-mile, percentage, flat rate, and hybrid support',
    enabled: true,
    category: 'money',
  },
  {
    key: 'driver_app',
    name: 'Driver App',
    description: 'Mobile driver app with route view, load details, and messaging',
    enabled: true,
    category: 'core',
  },

  // Sally AI
  {
    key: 'sally_ai_chat',
    name: 'Sally AI Chat',
    description: 'AI chat assistant for fleet operations',
    enabled: true,
    category: 'ai',
  },
  {
    key: 'sally_ai_actions',
    name: 'Sally AI Actions',
    description: 'AI-powered automated actions and workflows',
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
    key: 'alerts',
    name: 'Alerts System',
    description: 'Proactive notifications for HOS violations, delays, and critical events',
    enabled: true,
    category: 'operations',
  },

  // Tier integrations
  {
    key: 'samsara_integration',
    name: 'Samsara Integration',
    description: 'ELD sync, HOS data, and vehicle telematics from Samsara',
    enabled: true,
    category: 'integration',
  },
  {
    key: 'quickbooks_integration',
    name: 'QuickBooks Integration',
    description: 'Sync invoices and settlements to QuickBooks',
    enabled: true,
    category: 'integration',
  },
  {
    key: 'tms_integration',
    name: 'TMS Integration',
    description: 'External TMS data sync for drivers, vehicles, and loads',
    enabled: false,
    category: 'integration',
  },
  {
    key: 'custom_integrations',
    name: 'Custom Integrations',
    description: 'Custom integration adapters for third-party systems',
    enabled: false,
    category: 'integration',
  },
  {
    key: 'load_board',
    name: 'Load Board',
    description: 'Search external load boards for available spot market loads and import into SALLY',
    enabled: true,
    category: 'integration',
  },
  {
    key: 'email_intake',
    name: 'Email Intake',
    description: 'Automatic rate-con ingestion from inbound emails with AI parsing',
    enabled: false,
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

  // Relay loads (disabled by default — enable per tenant when ready)
  {
    key: 'relay_loads',
    name: 'Relay Loads',
    description: 'Split FTL loads across multiple drivers at exchange points with per-leg tracking',
    enabled: false,
    category: 'core',
  },

  // Address autocomplete + auto-mileage on loads (HERE Autosuggest, on by default)
  {
    key: 'places_autocomplete',
    name: 'Address Autocomplete',
    description: 'As-you-type address suggestions on stop picker (HERE), plus async distance + ETA on every load',
    enabled: true,
    category: 'core',
  },

  // Add-on features (kill-switch; access gated by add-on purchase, not by flag)
  {
    key: 'edi_integration',
    name: 'EDI Integration',
    description: 'Electronic data interchange for load tenders, invoices, status updates',
    enabled: true,
    category: 'integration',
  },
  {
    key: 'shield',
    name: 'Shield Compliance',
    description: 'DOT audit readiness dashboard with compliance scoring',
    enabled: true,
    category: 'operations',
  },
  {
    key: 'route_planning',
    name: 'Route Planning',
    description: 'Route optimization with HOS compliance, rest stops, and fuel stops',
    enabled: true,
    category: 'operations',
  },
  {
    key: 'doc_intelligence',
    name: 'Document Intelligence',
    description: 'Rate-con parsing and automatic load creation from documents',
    enabled: true,
    category: 'ai',
  },
  {
    key: 'command_center',
    name: 'Command Center',
    description: 'AI briefing, attention feed, monitoring pill, and shift notes',
    enabled: true,
    category: 'operations',
  },
  {
    key: 'ifta',
    name: 'IFTA Fuel Tax Reporting',
    description: 'Quarterly IFTA fuel tax tracking, state mileage reporting, and filing management',
    enabled: true,
    category: 'money',
  },
  {
    key: 'continuous_monitoring',
    name: 'Continuous Monitoring',
    description: 'Background service monitoring 14 trigger types every 60 seconds',
    enabled: true,
    category: 'operations',
  },
  {
    key: 'insights',
    name: 'Insights Dashboard',
    description: 'Fleet and financial insights with KPI dashboard, AI briefings, and 8 core reports',
    enabled: true,
    category: 'operations',
  },
  {
    key: 'horizon',
    name: 'Horizon Fleet Planner',
    description: 'Weekly capacity planning with driver/vehicle unavailability and AI load suggestions',
    enabled: true,
    category: 'operations',
  },
  {
    key: 'sallys_desk',
    name: "Sally's Desk",
    description: 'AI-powered operations desk with autonomous dispatch, compliance, and fleet management capabilities',
    enabled: true,
    category: 'ai',
  },

  // Payment System (when OFF: manual plan assignment via admin, mailto for upgrades; when ON: self-service Stripe checkout)
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
