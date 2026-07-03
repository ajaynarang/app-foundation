import { PlansService } from '../plans.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';

describe('PlansService', () => {
  let service: PlansService;
  let prisma: any;
  let cache: any;

  const mockPlanConfig = {
    plan: 'STARTER',
    displayName: 'Starter',
    tagline: 'Get started',
    pricePerUnitCents: 49,
    seatLimit: 10,
    userLimit: 5,
    isPopular: false,
    isActive: true,
    displayOrder: 1,
    ctaLabel: 'Start Free Trial',
    providerPriceId: null,
  };

  const mockEntitlement = {
    plan: 'STARTER',
    feature: 'shield',
    displayName: 'Shield Compliance',
    enabled: true,
  };

  beforeEach(() => {
    prisma = {
      planConfig: {
        findMany: jest.fn().mockResolvedValue([mockPlanConfig]),
        findUnique: jest.fn().mockResolvedValue(mockPlanConfig),
        update: jest.fn().mockResolvedValue(mockPlanConfig),
      },
      planEntitlement: {
        findMany: jest.fn().mockResolvedValue([mockEntitlement]),
        findUnique: jest.fn().mockResolvedValue(mockEntitlement),
        update: jest.fn().mockResolvedValue(mockEntitlement),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ plan: 'STARTER' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          plan: 'STARTER',
          trialStartedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 86400000 * 15),
          planAssignedAt: null,
          planAssignedBy: null,
          id: 1,
        }),
        update: jest.fn(),
      },
      tenantPlanEvent: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { count: jest.fn().mockResolvedValue(5) },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
      del: jest.fn().mockResolvedValue(undefined),
    };

    service = new PlansService(prisma, cache);
  });

  describe('getAllPlanConfigs', () => {
    it('should return plans with entitlements sorted', async () => {
      const result = await service.getAllPlanConfigs();
      expect(result).toHaveLength(1);
      expect(result[0].entitlements).toBeDefined();
    });
  });

  describe('getTenantPlan', () => {
    it('should return tenant plan from cache', async () => {
      const result = await service.getTenantPlan('tenant_abc');
      expect(result).toBe('STARTER');
    });

    it('should return TRIAL when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      const result = await service.getTenantPlan('missing');
      expect(result).toBe('TRIAL');
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return true for ENTERPRISE', async () => {
      const result = await service.isFeatureEnabled('ENTERPRISE', 'anything');
      expect(result).toBe(true);
    });

    it('should return false for TRIAL_EXPIRED', async () => {
      const result = await service.isFeatureEnabled('TRIAL_EXPIRED', 'anything');
      expect(result).toBe(false);
    });

    it('should return false for SUSPENDED', async () => {
      const result = await service.isFeatureEnabled('SUSPENDED', 'anything');
      expect(result).toBe(false);
    });

    it('should check entitlement for regular plans', async () => {
      const result = await service.isFeatureEnabled('STARTER', 'shield');
      expect(result).toBe(true);
    });

    it('should return false when no entitlement found', async () => {
      prisma.planEntitlement.findUnique.mockResolvedValue(null);
      const result = await service.isFeatureEnabled('STARTER', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('assignPlan', () => {
    it('should update tenant plan and create event', async () => {
      prisma.tenant.update.mockResolvedValue({
        tenantId: 'tenant_abc',
        plan: 'PROFESSIONAL',
      });
      prisma.tenantPlanEvent.create.mockResolvedValue({});

      await service.assignPlan('tenant_abc', 'PROFESSIONAL', 'admin@test.com', 'Upgrade');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('updateProviderPriceId', () => {
    it('should update provider price id', async () => {
      await service.updateProviderPriceId('STARTER', 'price_123');
      expect(prisma.planConfig.update).toHaveBeenCalledWith({
        where: { plan: 'STARTER' },
        data: { providerPriceId: 'price_123' },
      });
    });
  });

  describe('updatePlanConfig', () => {
    it('should update and invalidate cache', async () => {
      await service.updatePlanConfig('STARTER', {
        displayName: 'New Name',
      });
      expect(prisma.planConfig.update).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('toggleEntitlement', () => {
    it('should toggle and invalidate cache', async () => {
      await service.toggleEntitlement('STARTER', 'shield', false);
      expect(prisma.planEntitlement.update).toHaveBeenCalledWith({
        where: { plan_feature: { plan: 'STARTER', feature: 'shield' } },
        data: { enabled: false },
      });
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('getTenantPlanDetails', () => {
    it('should return full plan details with user count and trial days', async () => {
      const result = await service.getTenantPlanDetails('tenant_abc');
      expect(result.plan).toBe('STARTER');
      expect(result.userCount).toBe(5);
      expect(result.daysLeftInTrial).toBeGreaterThan(0);
      expect(result.planConfig).toBeDefined();
    });
  });
});
