import { PrismaClient } from '@prisma/client';

/**
 * Add-on catalog — 8 purchasable add-ons.
 * These are NEVER included in any plan tier for free; they are always purchased or gifted.
 * Usage limits are tier-aware: { STARTER: N, PROFESSIONAL: N, ENTERPRISE: N }
 */
const ADD_ONS = [
  {
    slug: 'edi_integration',
    name: 'EDI',
    description:
      'Send and receive load tenders, invoices, and status updates electronically with brokers like C.H. Robinson, Echo, and XPO.',
    icon: 'zap',
    category: 'integrations',
    priceCents: 3900,
    billingInterval: 'monthly',
    featureKey: 'edi_integration',
    usageLimits: { STARTER: 100, PROFESSIONAL: 300, ENTERPRISE: 1000 },
    usageLimitUnit: 'messages',
    overageRateCents: 5,
    displayOrder: 1,
  },
  {
    slug: 'shield_compliance',
    name: 'Shield',
    description:
      'Stay audit-ready with automated DOT monitoring, driver and vehicle scoring, and proactive violation alerts before they become fines.',
    icon: 'shield-check',
    category: 'compliance',
    priceCents: 2900,
    billingInterval: 'monthly',
    featureKey: 'shield',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 2,
  },
  {
    slug: 'route_planning',
    name: 'Smart Routes',
    description:
      'Optimize multi-stop routes with built-in hours of service checks, real-time traffic, and fuel stop planning.',
    icon: 'route',
    category: 'operations',
    priceCents: 1900,
    billingInterval: 'monthly',
    featureKey: 'route_planning',
    usageLimits: { STARTER: 25, PROFESSIONAL: 75, ENTERPRISE: 300 },
    usageLimitUnit: 'routes',
    overageRateCents: 25,
    displayOrder: 3,
  },
  {
    slug: 'doc_intelligence',
    name: 'Doc Intelligence',
    description:
      'Upload a rate confirmation or BOL and let Sally extract load details, charges, and stops automatically.',
    icon: 'file-text',
    category: 'ai',
    priceCents: 900,
    billingInterval: 'monthly',
    featureKey: 'doc_intelligence',
    usageLimits: { STARTER: 25, PROFESSIONAL: 75, ENTERPRISE: 300 },
    usageLimitUnit: 'documents',
    overageRateCents: 15,
    displayOrder: 4,
  },
  {
    slug: 'command_center',
    name: 'Command Center',
    description:
      'See your entire fleet at a glance — live load status, driver positions, upcoming appointments, and dispatch priorities.',
    icon: 'home',
    category: 'operations',
    priceCents: 900,
    billingInterval: 'monthly',
    featureKey: 'command_center',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 5,
  },
  {
    slug: 'ifta_reporting',
    name: 'IFTA',
    description: 'Track miles by state, scan fuel receipts, and generate quarterly IFTA reports ready for filing.',
    icon: 'fuel',
    category: 'compliance',
    priceCents: 1400,
    billingInterval: 'monthly',
    featureKey: 'ifta',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 6,
  },
  {
    slug: 'continuous_monitoring',
    name: 'Fleet Watch',
    description:
      'Background monitoring that checks your fleet 24/7 and sends alerts for HOS violations, missed appointments, and anomalies.',
    icon: 'activity',
    category: 'operations',
    priceCents: 1400,
    billingInterval: 'monthly',
    featureKey: 'continuous_monitoring',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 7,
  },
  {
    slug: 'insights',
    name: 'Insights',
    description:
      'Understand your fleet performance with revenue per mile, driver profitability, lane analysis, and operational trends.',
    icon: 'bar-chart-3',
    category: 'operations',
    priceCents: 900,
    billingInterval: 'monthly',
    featureKey: 'insights',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 8,
  },
];

export const seed = {
  name: 'Add-Ons',
  description: `Creates ${ADD_ONS.length} add-on catalog entries`,

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    // Remove old add-ons that are no longer in the catalog
    const validSlugs = ADD_ONS.map((a) => a.slug);
    const existingAddOns = await prisma.addOn.findMany({ select: { slug: true } });
    for (const e of existingAddOns) {
      if (!validSlugs.includes(e.slug)) {
        await prisma.addOn.delete({ where: { slug: e.slug } });
      }
    }

    for (const addOn of ADD_ONS) {
      const existing = await prisma.addOn.findUnique({
        where: { slug: addOn.slug },
      });

      if (existing) {
        await prisma.addOn.update({
          where: { slug: addOn.slug },
          data: {
            name: addOn.name,
            description: addOn.description,
            icon: addOn.icon,
            category: addOn.category,
            priceCents: addOn.priceCents,
            billingInterval: addOn.billingInterval,
            featureKey: addOn.featureKey,
            usageLimits: addOn.usageLimits,
            usageLimitUnit: addOn.usageLimitUnit,
            overageRateCents: addOn.overageRateCents,
            displayOrder: addOn.displayOrder,
          },
        });
        skipped++;
      } else {
        await prisma.addOn.create({ data: addOn });
        created++;
      }
    }

    return { created, skipped };
  },
};
