import { PrismaClient, TenantPlan } from '../../generated/client';

const planConfigs = [
  {
    plan: TenantPlan.TRIAL,
    displayName: 'Trial',
    tagline: 'Full platform access for 30 days',
    pricePerUnit: null,
    unitLabel: 'seat/month',
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
    displayName: 'Starter',
    tagline: 'For teams getting started',
    pricePerUnit: 2900, // $29/seat/month
    unitLabel: 'seat/month',
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
    displayName: 'Professional',
    tagline: 'For growing teams',
    pricePerUnit: 4900, // $49/seat/month
    unitLabel: 'seat/month',
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
    displayName: 'Enterprise',
    tagline: 'For enterprise-grade organizations',
    pricePerUnit: null,
    unitLabel: 'seat/month',
    fleetLimit: null,
    userLimit: null,
    isPopular: false,
    ctaLabel: 'Contact Sales',
    ctaUrl: 'mailto:sales@example.com',
    displayOrder: 3,
    isActive: true,
  },
];

export const seed = {
  name: 'Plan Config',
  description: 'Creates pricing tier display configuration (Starter, Professional, Enterprise)',

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
