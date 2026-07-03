import { PrismaClient } from '../../generated/client';

/**
 * Add-on catalog — purchasable add-ons.
 * These are NEVER included in any plan tier for free; they are always purchased or gifted.
 * Usage limits are tier-aware: { STARTER: N, PROFESSIONAL: N, ENTERPRISE: N }
 */
const ADD_ONS = [
  {
    slug: 'extra_seats',
    name: 'Extra Seats',
    description: 'Add additional member seats beyond your plan limit, billed per seat.',
    icon: 'users',
    category: 'platform',
    priceCents: 1500,
    billingInterval: 'monthly',
    featureKey: 'extra_seats',
    usageLimits: { STARTER: 5, PROFESSIONAL: 20, ENTERPRISE: 100 },
    usageLimitUnit: 'seats',
    overageRateCents: 15,
    displayOrder: 1,
  },
  {
    slug: 'priority_support',
    name: 'Priority Support',
    description: 'Faster response times, a dedicated support channel, and priority issue handling.',
    icon: 'life-buoy',
    category: 'support',
    priceCents: 2900,
    billingInterval: 'monthly',
    featureKey: 'priority_support',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 2,
  },
  {
    slug: 'advanced_analytics',
    name: 'Advanced Analytics',
    description: 'Deeper dashboards, custom reports, and exportable usage and performance trends.',
    icon: 'bar-chart-3',
    category: 'analytics',
    priceCents: 1900,
    billingInterval: 'monthly',
    featureKey: 'advanced_analytics',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
    displayOrder: 3,
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
