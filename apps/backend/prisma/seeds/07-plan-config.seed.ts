import { PrismaClient, TenantPlan } from '@prisma/client';

const planConfigs = [
  {
    plan: TenantPlan.TRIAL,
    displayName: 'Trial',
    tagline: 'Full platform access for 30 days',
    pricePerUnit: null,
    unitLabel: 'truck/month',
    fleetLimit: 50, // Generous trial limit
    userLimit: 50,
    isPopular: false,
    ctaLabel: 'Start Free Trial',
    ctaUrl: '/register',
    displayOrder: 0,
    isActive: false, // Not shown in plan selector — trial is only assigned on registration
  },
  {
    plan: TenantPlan.STARTER,
    displayName: 'Haul',
    tagline: 'For carriers getting started',
    pricePerUnit: 2900, // $29/truck/month
    unitLabel: 'truck/month',
    fleetLimit: 10,
    userLimit: 5,
    isPopular: false,
    ctaLabel: 'Start Free Trial',
    ctaUrl: '/register',
    displayOrder: 1,
    isActive: true,
  },
  {
    plan: TenantPlan.PROFESSIONAL,
    displayName: 'Fleet',
    tagline: 'For growing fleet operations',
    pricePerUnit: 4900, // $49/truck/month
    unitLabel: 'truck/month',
    fleetLimit: 25,
    userLimit: 25,
    isPopular: true,
    ctaLabel: 'Start Free Trial',
    ctaUrl: '/register',
    displayOrder: 2,
    isActive: true,
  },
  {
    plan: TenantPlan.ENTERPRISE,
    displayName: 'Freight Force',
    tagline: 'For enterprise-grade carriers',
    pricePerUnit: null,
    unitLabel: 'truck/month',
    fleetLimit: null,
    userLimit: null,
    isPopular: false,
    ctaLabel: 'Contact Sales',
    ctaUrl: 'mailto:sally@appshore.in',
    displayOrder: 3,
    isActive: true,
  },
];

export const seed = {
  name: 'Plan Config',
  description: 'Creates pricing tier display configuration (Haul, Fleet, Freight Force)',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const config of planConfigs) {
      const existing = await prisma.planConfig.findUnique({
        where: { plan: config.plan },
      });

      if (existing) {
        await prisma.planConfig.update({
          where: { plan: config.plan },
          data: {
            displayName: config.displayName,
            tagline: config.tagline,
            pricePerUnit: config.pricePerUnit,
            unitLabel: config.unitLabel,
            fleetLimit: config.fleetLimit,
            userLimit: config.userLimit,
            isPopular: config.isPopular,
            ctaLabel: config.ctaLabel,
            ctaUrl: config.ctaUrl,
          },
        });
        skipped++;
      } else {
        await prisma.planConfig.create({ data: config });
        created++;
      }
    }

    return { created, skipped };
  },
};
