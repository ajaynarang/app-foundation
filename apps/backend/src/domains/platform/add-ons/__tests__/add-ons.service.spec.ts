import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AddOnsService } from '../add-ons.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { SubscriptionService } from '../../../billing/services/subscription.service';
import { WalletService } from '../../../billing/services/wallet.service';

describe('AddOnsService', () => {
  let service: AddOnsService;
  let prisma: any;
  let cache: any;
  let featureFlagsService: any;
  let subscriptionService: any;
  let walletService: any;

  const mockAddOn = {
    id: 'addon-1',
    slug: 'edi_integration',
    name: 'EDI Integration',
    description: 'EDI desc',
    icon: '\u26A1',
    category: 'integrations',
    priceCents: 3900,
    billingInterval: 'monthly',
    featureKey: 'edi_integration',
    usageLimits: { STARTER: 100, PROFESSIONAL: 300, ENTERPRISE: 1000 },
    usageLimitUnit: 'messages',
    overageRateCents: 5,
    providerPriceId: 'price_test_123',
    isActive: true,
    displayOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUnlimitedAddOn = {
    ...mockAddOn,
    id: 'addon-2',
    slug: 'shield_compliance',
    featureKey: 'shield',
    usageLimits: null,
    usageLimitUnit: null,
    overageRateCents: null,
  };

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
    };

    featureFlagsService = {
      isEnabled: jest.fn().mockResolvedValue(true),
    };

    prisma = {
      addOn: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenantAddOn: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      tenantAddOnEvent: {
        create: jest.fn(),
      },
      addOnRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ plan: 'PROFESSIONAL' }),
      },
      $executeRaw: jest.fn(),
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };

    subscriptionService = {
      getActiveSubscription: jest.fn(),
      addSubscriptionItem: jest.fn(),
      removeSubscriptionItem: jest.fn(),
      addAddOnToSubscription: jest.fn().mockResolvedValue('si_test_123'),
      removeAddOnFromSubscription: jest.fn(),
    };

    walletService = {
      deductOverage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddOnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: FeatureFlagsService, useValue: featureFlagsService },
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: WalletService, useValue: walletService },
      ],
    }).compile();

    service = module.get<AddOnsService>(AddOnsService);
  });

  describe('listAddOns', () => {
    it('should return all active add-ons ordered by displayOrder', async () => {
      prisma.addOn.findMany.mockResolvedValue([mockAddOn]);

      const result = await service.listAddOns();

      expect(result).toEqual([mockAddOn]);
      expect(prisma.addOn.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      });
    });
  });

  describe('getAddOnBySlug', () => {
    it('should return add-on by slug', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);

      const result = await service.getAddOnBySlug('edi_integration');
      expect(result).toEqual(mockAddOn);
    });

    it('should throw NotFoundException for unknown slug', async () => {
      prisma.addOn.findUnique.mockResolvedValue(null);

      await expect(service.getAddOnBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('isFeatureEnabled', () => {
    it('should return feature_flag_disabled when global flag is off', async () => {
      featureFlagsService.isEnabled.mockResolvedValue(false);

      const result = await service.isFeatureEnabled(1, 'edi_integration');

      expect(result).toEqual({
        enabled: false,
        source: 'feature_flag_disabled',
      });
      expect(prisma.addOn.findFirst).not.toHaveBeenCalled();
    });

    it('should return not_enabled when no add-on record exists for feature', async () => {
      prisma.addOn.findFirst.mockResolvedValue(null);

      const result = await service.isFeatureEnabled(1, 'unknown_feature');

      expect(result).toEqual({ enabled: false, source: 'not_enabled' });
    });

    it('should return addon_active when tenant has active purchased add-on', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'ACTIVE',
        source: 'purchased',
        usageLimit: null,
        currentUsage: 0,
      });

      const result = await service.isFeatureEnabled(1, 'edi_integration');

      expect(result).toEqual({
        enabled: true,
        source: 'addon_active',
        usageRemaining: null,
      });
    });

    it('should return addon_active with usage remaining for metered add-on', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        id: 'ta-2',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'ACTIVE',
        source: 'purchased',
        usageLimit: 300,
        currentUsage: 120,
      });

      const result = await service.isFeatureEnabled(1, 'edi_integration');

      expect(result).toEqual({
        enabled: true,
        source: 'addon_active',
        usageRemaining: 180,
      });
    });

    it('should return not_enabled when add-on exists but tenant has no active subscription (no grace period)', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findFirst.mockResolvedValue(null);

      const result = await service.isFeatureEnabled(1, 'edi_integration');

      expect(result).toEqual({ enabled: false, source: 'not_enabled' });
    });

    it('should return not_enabled for cancelled add-on (immediate stop)', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      // findFirst with status: 'ACTIVE' returns null for cancelled
      prisma.tenantAddOn.findFirst.mockResolvedValue(null);

      const result = await service.isFeatureEnabled(1, 'edi_integration');

      expect(result).toEqual({ enabled: false, source: 'not_enabled' });
    });

    it('should use cached result when available', async () => {
      const cachedResult = {
        enabled: true,
        source: 'addon_active',
        usageRemaining: null,
      };
      cache.getOrSet.mockResolvedValueOnce(cachedResult);

      const result = await service.isFeatureEnabled(1, 'edi_integration');

      expect(result).toEqual(cachedResult);
      expect(featureFlagsService.isEnabled).not.toHaveBeenCalled();
      expect(prisma.addOn.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('activateAddOn', () => {
    it('should create TenantAddOn with tier-aware usage limit', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
      });
      const expectedTenantAddOn = {
        id: 'ta-new',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'ACTIVE',
        source: 'purchased',
        priceCents: 3900,
        usageLimit: 300,
      };
      prisma.tenantAddOn.upsert.mockResolvedValue(expectedTenantAddOn);
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      const result = await service.activateAddOn(1, 'edi_integration', 'purchased', 'admin@test.com');

      expect(result).toEqual(expectedTenantAddOn);
      expect(prisma.tenantAddOn.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_addOnId: { tenantId: 1, addOnId: mockAddOn.id } },
          create: expect.objectContaining({
            usageLimit: 300,
            usageLimitUnit: 'messages',
          }),
        }),
      );
      expect(cache.del).toHaveBeenCalledWith('sally:addons:resolution:1:edi_integration');
    });
  });

  describe('cancelAddOn', () => {
    it('should set status to cancelled (immediate stop)', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'ACTIVE',
      });
      const cancelledAddOn = {
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'CANCELLED',
        cancelledAt: expect.any(Date),
        cancelledBy: 'admin@test.com',
      };
      prisma.tenantAddOn.update.mockResolvedValue(cancelledAddOn);
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      const result = await service.cancelAddOn(1, 'edi_integration', 'admin@test.com', 'No longer needed');

      expect(result.status).toBe('CANCELLED');
      expect(prisma.tenantAddOn.update).toHaveBeenCalledWith({
        where: { tenantId_addOnId: { tenantId: 1, addOnId: mockAddOn.id } },
        data: {
          status: 'CANCELLED',
          cancelledAt: expect.any(Date),
          cancelledBy: 'admin@test.com',
        },
      });
    });

    it('should throw NotFoundException when tenant does not have the add-on', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue(null);

      await expect(service.cancelAddOn(1, 'edi_integration', 'admin@test.com')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when add-on is already cancelled', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'CANCELLED',
      });

      await expect(service.cancelAddOn(1, 'edi_integration', 'admin@test.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleOverage', () => {
    it('should enable overage for active add-on', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'ACTIVE',
        allowOverage: false,
      });
      prisma.tenantAddOn.update.mockResolvedValue({
        id: 'ta-1',
        allowOverage: true,
      });
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      const result = await service.toggleOverage(1, 'edi_integration', true, 'admin@test.com');

      expect(result.allowOverage).toBe(true);
      expect(prisma.tenantAddOnEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'overage_enabled',
        }),
      });
    });

    it('should throw when add-on is not active', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'CANCELLED',
      });

      await expect(service.toggleOverage(1, 'edi_integration', true, 'admin@test.com')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when tenant does not have add-on', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue(null);

      await expect(service.toggleOverage(1, 'edi_integration', true, 'admin@test.com')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage atomically and return allowed', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        currentUsage: 101,
        usageLimit: 300,
        overageUsage: 0,
      });

      const result = await service.incrementUsage(1, 'edi_integration');

      expect(result).toEqual({
        allowed: true,
        currentUsage: 101,
        usageLimit: 300,
        overageUsage: 0,
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should reject when usage limit is reached and overage is disabled', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.$executeRaw.mockResolvedValue(0);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        currentUsage: 300,
        usageLimit: 300,
        allowOverage: false,
        overageUsage: 0,
      });

      const result = await service.incrementUsage(1, 'edi_integration');

      expect(result).toEqual({
        allowed: false,
        currentUsage: 300,
        usageLimit: 300,
        overageUsage: 0,
      });
    });

    it('should allow overage when limit reached and overage is enabled', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.$executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // first update fails (at limit), second (overage) succeeds
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        currentUsage: 300,
        usageLimit: 300,
        allowOverage: true,
        overageUsage: 5,
      });
      walletService.deductOverage.mockResolvedValue({
        allowed: true,
        currentBalance: 5000,
      });

      const result = await service.incrementUsage(1, 'edi_integration');

      expect(result).toEqual({
        allowed: true,
        currentUsage: 300,
        usageLimit: 300,
        overageUsage: 6,
      });
    });

    it('should return not allowed when add-on is not active', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.$executeRaw.mockResolvedValue(0);
      prisma.tenantAddOn.findFirst.mockResolvedValue(null);

      const result = await service.incrementUsage(1, 'edi_integration');

      expect(result).toEqual({
        allowed: false,
        currentUsage: 0,
        usageLimit: null,
        overageUsage: 0,
      });
    });

    it('should allow when no add-on record exists for feature', async () => {
      prisma.addOn.findFirst.mockResolvedValue(null);

      const result = await service.incrementUsage(1, 'unknown_feature');

      expect(result).toEqual({
        allowed: true,
        currentUsage: 0,
        usageLimit: null,
        overageUsage: 0,
      });
    });
  });

  describe('request workflow', () => {
    it('should create a request for an add-on', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.addOnRequest.findFirst.mockResolvedValue(null);
      prisma.tenantAddOn.findFirst.mockResolvedValue(null);
      const expectedRequest = {
        id: 'req-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'PENDING',
        requestedByUserId: 10,
        requestNote: 'We need EDI',
      };
      prisma.addOnRequest.create.mockResolvedValue(expectedRequest);

      const result = await service.createRequest(1, 'edi_integration', 10, 'We need EDI');

      expect(result).toEqual(expectedRequest);
      expect(prisma.addOnRequest.create).toHaveBeenCalledWith({
        data: {
          tenantId: 1,
          addOnId: mockAddOn.id,
          requestedByUserId: 10,
          requestNote: 'We need EDI',
        },
        include: { addOn: true },
      });
    });

    it('should reject duplicate pending request', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.addOnRequest.findFirst.mockResolvedValue({
        id: 'existing',
        status: 'PENDING',
      });

      await expect(service.createRequest(1, 'edi_integration', 10)).rejects.toThrow(BadRequestException);
    });

    it('should reject request when add-on is already active', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.addOnRequest.findFirst.mockResolvedValue(null);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        id: 'ta-1',
        status: 'ACTIVE',
      });

      await expect(service.createRequest(1, 'edi_integration', 10)).rejects.toThrow(BadRequestException);
    });

    it('should approve a request and activate the add-on in a transaction', async () => {
      const request = {
        id: 'req-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'PENDING',
        addOn: mockAddOn,
      };
      prisma.addOnRequest.findUnique.mockResolvedValue(request);
      // activateAddOn mocks (called within transaction callback but uses this.prisma)
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, plan: 'STARTER' });
      prisma.tenantAddOn.upsert.mockResolvedValue({
        id: 'ta-new',
        status: 'ACTIVE',
      });
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      // Mock $transaction to execute the callback with a tx proxy that delegates to prisma
      prisma.$transaction = jest.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const txProxy = {
          addOnRequest: prisma.addOnRequest,
        };
        return cb(txProxy);
      });
      prisma.addOnRequest.update.mockResolvedValue({
        ...request,
        status: 'APPROVED',
      });

      const result = await service.approveRequest('req-1', 99);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.status).toBe('ACTIVE');
    });

    it('should decline a request with reason', async () => {
      const request = { id: 'req-1', status: 'PENDING' };
      prisma.addOnRequest.findUnique.mockResolvedValue(request);
      prisma.addOnRequest.update.mockResolvedValue({
        ...request,
        status: 'DECLINED',
      });

      const result = await service.declineRequest('req-1', 99, 'Not needed');

      expect(result.status).toBe('DECLINED');
      expect(prisma.addOnRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: 'DECLINED',
          declineReason: 'Not needed',
        }),
      });
    });

    it('should throw when approving non-pending request', async () => {
      prisma.addOnRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APPROVED',
      });

      await expect(service.approveRequest('req-1', 99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetMonthlyUsageForTenant', () => {
    const boundary = new Date('2026-06-01T00:00:00.000Z');

    it('resets only the given tenant and stamps usageResetAt = boundary', async () => {
      prisma.tenantAddOn.findMany.mockResolvedValue([
        {
          id: 'ta-5',
          tenantId: 5,
          addOnId: 'addon-1',
          currentUsage: 120,
          overageUsage: 4,
          usageLimit: 300,
          usageResetAt: null,
          addOn: { featureKey: 'edi_integration' },
        },
      ]);
      prisma.tenantAddOnEvent.createMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.tenantAddOn.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const result = await service.resetMonthlyUsageForTenant(5, boundary);

      expect(result).toEqual({ reset: 1 });
      // Snapshot query scoped to the tenant + guarded on usageResetAt
      expect(prisma.tenantAddOn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 5,
            status: 'ACTIVE',
            usageLimit: { not: null },
            OR: [{ usageResetAt: null }, { usageResetAt: { lt: boundary } }],
          }),
        }),
      );
      // Reset scoped to the tenant + stamps the boundary
      expect(prisma.tenantAddOn.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 5, status: 'ACTIVE', usageLimit: { not: null } },
        data: { currentUsage: 0, overageUsage: 0, usageResetAt: boundary },
      });
      expect(prisma.tenantAddOnEvent.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenantId: 5,
            eventType: 'usage_reset',
            metadata: expect.objectContaining({ finalUsage: 120, finalOverage: 4, period: '2026-06' }),
          }),
        ]),
      });
      expect(cache.del).toHaveBeenCalledWith('sally:addons:resolution:5:edi_integration');
    });

    it('is a no-op (reset: 0) when the tenant was already reset this period', async () => {
      // No rows match the usageResetAt guard → already reset for this period.
      prisma.tenantAddOn.findMany.mockResolvedValue([]);
      prisma.tenantAddOnEvent.createMany = jest.fn();
      prisma.tenantAddOn.updateMany = jest.fn();

      const result = await service.resetMonthlyUsageForTenant(5, boundary);

      expect(result).toEqual({ reset: 0 });
      expect(prisma.tenantAddOnEvent.createMany).not.toHaveBeenCalled();
      expect(prisma.tenantAddOn.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listAllAddOns', () => {
    it('should return all add-ons including inactive', async () => {
      prisma.addOn.findMany.mockResolvedValue([mockAddOn, mockUnlimitedAddOn]);

      const result = await service.listAllAddOns();

      expect(result).toEqual([mockAddOn, mockUnlimitedAddOn]);
      expect(prisma.addOn.findMany).toHaveBeenCalledWith({
        orderBy: { displayOrder: 'asc' },
      });
    });
  });

  describe('updateProviderPriceId', () => {
    it('should update the providerPriceId on an add-on', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.addOn.update.mockResolvedValue({
        ...mockAddOn,
        providerPriceId: 'price_new',
      });

      const result = await service.updateProviderPriceId('edi_integration', 'price_new');

      expect(result.providerPriceId).toBe('price_new');
      expect(prisma.addOn.update).toHaveBeenCalledWith({
        where: { id: mockAddOn.id },
        data: { providerPriceId: 'price_new' },
      });
    });

    it('should set providerPriceId to null when empty string passed', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.addOn.update.mockResolvedValue({
        ...mockAddOn,
        providerPriceId: null,
      });

      await service.updateProviderPriceId('edi_integration', '');

      expect(prisma.addOn.update).toHaveBeenCalledWith({
        where: { id: mockAddOn.id },
        data: { providerPriceId: null },
      });
    });
  });

  describe('updateAddOn', () => {
    it('should update add-on catalog entry and invalidate cache', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      const updatedAddOn = { ...mockAddOn, name: 'Updated EDI' };
      prisma.addOn.update.mockResolvedValue(updatedAddOn);

      const result = await service.updateAddOn('edi_integration', {
        name: 'Updated EDI',
      });

      expect(result).toEqual(updatedAddOn);
      expect(cache.del).toHaveBeenCalledWith(`sally:addons:catalog:${mockAddOn.featureKey}`);
    });
  });

  describe('getAddOnBySlugOrFeatureKey', () => {
    it('should find by slug first', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);

      const result = await service.getAddOnBySlugOrFeatureKey('edi_integration');

      expect(result).toEqual(mockAddOn);
      expect(prisma.addOn.findFirst).not.toHaveBeenCalled();
    });

    it('should fall back to featureKey when slug not found', async () => {
      prisma.addOn.findUnique.mockResolvedValue(null);
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);

      const result = await service.getAddOnBySlugOrFeatureKey('edi_integration');

      expect(result).toEqual(mockAddOn);
      expect(prisma.addOn.findFirst).toHaveBeenCalledWith({
        where: { featureKey: 'edi_integration' },
      });
    });

    it('should throw NotFoundException when neither slug nor featureKey found', async () => {
      prisma.addOn.findUnique.mockResolvedValue(null);
      prisma.addOn.findFirst.mockResolvedValue(null);

      await expect(service.getAddOnBySlugOrFeatureKey('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAddOnByFeatureKey', () => {
    it('should return cached add-on by feature key', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);

      const result = await service.getAddOnByFeatureKey('edi_integration');

      expect(result).toEqual(mockAddOn);
      expect(cache.getOrSet).toHaveBeenCalled();
    });

    it('should return null when no active add-on found', async () => {
      prisma.addOn.findFirst.mockResolvedValue(null);

      const result = await service.getAddOnByFeatureKey('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getAddOnsForPricingPage', () => {
    it('should return active add-ons with pricing fields', async () => {
      prisma.addOn.findMany.mockResolvedValue([mockAddOn]);

      const result = await service.getAddOnsForPricingPage();

      expect(result).toEqual([mockAddOn]);
      expect(prisma.addOn.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: expect.objectContaining({
          slug: true,
          name: true,
          priceCents: true,
          providerPriceId: true,
        }),
      });
    });
  });

  describe('getAddOnStatus', () => {
    it('should return add-on status including resolution and tenantAddOn', async () => {
      // getAddOnBySlugOrFeatureKey
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      // isFeatureEnabled
      featureFlagsService.isEnabled.mockResolvedValue(true);
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        id: 'ta-1',
        status: 'ACTIVE',
        usageLimit: null,
        currentUsage: 0,
      });
      // direct tenantAddOn lookup
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        id: 'ta-1',
        status: 'ACTIVE',
      });

      const result = await service.getAddOnStatus(1, 'edi_integration');

      expect(result.addOn).toEqual(mockAddOn);
      expect(result.enabled).toBe(true);
      expect(result.tenantAddOn).toBeDefined();
    });
  });

  describe('listTenantAddOns', () => {
    it('should return tenant add-ons with add-on details', async () => {
      const tenantAddOns = [{ id: 'ta-1', addOn: mockAddOn, status: 'ACTIVE' }];
      prisma.tenantAddOn.findMany.mockResolvedValue(tenantAddOns);

      const result = await service.listTenantAddOns(1);

      expect(result).toEqual(tenantAddOns);
      expect(prisma.tenantAddOn.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1 },
        include: { addOn: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listMyRequests', () => {
    it('should return requests for the current tenant', async () => {
      const requests = [{ id: 'req-1', addOn: mockAddOn }];
      prisma.addOnRequest.findMany.mockResolvedValue(requests);

      const result = await service.listMyRequests(1);

      expect(result).toEqual(requests);
      expect(prisma.addOnRequest.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1 },
        include: { addOn: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('listRequests', () => {
    it('should return enriched requests with addOnActive status', async () => {
      prisma.addOnRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          tenantId: 1,
          addOnId: 'addon-1',
          status: 'APPROVED',
          addOn: mockAddOn,
          tenant: { id: 1, tenantId: 'tnt-1', companyName: 'Fleet Co' },
        },
        {
          id: 'req-2',
          tenantId: 2,
          addOnId: 'addon-1',
          status: 'PENDING',
          addOn: mockAddOn,
          tenant: { id: 2, tenantId: 'tnt-2', companyName: 'Fleet 2' },
        },
      ]);
      prisma.tenantAddOn.findUnique.mockResolvedValue({ status: 'ACTIVE' });

      const result = await service.listRequests();

      expect(result).toHaveLength(2);
      expect(result[0].addOnActive).toBe(true);
      expect(result[1].addOnActive).toBe(false);
    });

    it('should filter by status when provided', async () => {
      prisma.addOnRequest.findMany.mockResolvedValue([]);

      await service.listRequests('PENDING');

      expect(prisma.addOnRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING' },
        }),
      );
    });

    it('should mark addOnActive false when tenantAddOn is not active', async () => {
      prisma.addOnRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          tenantId: 1,
          addOnId: 'addon-1',
          status: 'APPROVED',
          addOn: mockAddOn,
          tenant: { id: 1, tenantId: 'tnt-1', companyName: 'Fleet Co' },
        },
      ]);
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        status: 'CANCELLED',
      });

      const result = await service.listRequests();

      expect(result[0].addOnActive).toBe(false);
    });
  });

  describe('activateAddOn — trial tenant', () => {
    it('should gift add-on at $0 for trial tenant and skip Stripe', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        plan: 'TRIAL',
      });
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, plan: 'TRIAL' });
      prisma.tenantAddOn.upsert.mockResolvedValue({
        id: 'ta-new',
        status: 'ACTIVE',
        source: 'gifted',
        priceCents: 0,
      });
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      const result = await service.activateAddOn(1, 'edi_integration', 'purchased', 'admin@test.com', 3900);

      expect(result.source).toBe('gifted');
      expect(result.priceCents).toBe(0);
      expect(prisma.tenantAddOn.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            source: 'gifted',
            priceCents: 0,
          }),
        }),
      );
      // Should NOT call Stripe for trial tenants
      expect(subscriptionService.addAddOnToSubscription).not.toHaveBeenCalled();
    });
  });

  describe('activateAddOn — Stripe rollback on failure', () => {
    it('should roll back activation when Stripe sync fails', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
      });
      prisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        plan: 'PROFESSIONAL',
      });
      prisma.tenantAddOn.upsert.mockResolvedValue({
        id: 'ta-new',
        status: 'ACTIVE',
      });
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      // Simulate Stripe failure
      featureFlagsService.isEnabled.mockResolvedValue(true);
      subscriptionService.addAddOnToSubscription.mockResolvedValue(null);

      await expect(service.activateAddOn(1, 'edi_integration', 'purchased', 'admin@test.com')).rejects.toThrow(
        BadRequestException,
      );

      // Should have rolled back
      expect(prisma.tenantAddOn.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            cancelledBy: 'system-rollback',
          }),
        }),
      );
    });
  });

  describe('toggleOverage — disable overage', () => {
    it('should disable overage for active add-on', async () => {
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenantAddOn.findUnique.mockResolvedValue({
        id: 'ta-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'ACTIVE',
        allowOverage: true,
      });
      prisma.tenantAddOn.update.mockResolvedValue({
        id: 'ta-1',
        allowOverage: false,
      });
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      const result = await service.toggleOverage(1, 'edi_integration', false, 'admin@test.com');

      expect(result.allowOverage).toBe(false);
      expect(prisma.tenantAddOnEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'overage_disabled',
        }),
      });
    });
  });

  describe('incrementUsage — overage blocked by wallet', () => {
    it('should return wallet_empty reason when wallet has insufficient balance', async () => {
      prisma.addOn.findFirst.mockResolvedValue(mockAddOn);
      prisma.$executeRaw.mockResolvedValueOnce(0);
      prisma.tenantAddOn.findFirst.mockResolvedValue({
        currentUsage: 300,
        usageLimit: 300,
        allowOverage: true,
        overageUsage: 5,
      });
      walletService.deductOverage.mockResolvedValue({
        allowed: false,
        currentBalance: 0,
      });

      const result = await service.incrementUsage(1, 'edi_integration');

      expect(result).toEqual({
        allowed: false,
        reason: 'wallet_empty',
        currentUsage: 300,
        usageLimit: 300,
        overageUsage: 5,
      });
    });
  });

  describe('approveRequest — not found', () => {
    it('should throw NotFoundException when request not found', async () => {
      prisma.addOnRequest.findUnique.mockResolvedValue(null);

      await expect(service.approveRequest('bad-id', 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('declineRequest — edge cases', () => {
    it('should throw NotFoundException when request not found', async () => {
      prisma.addOnRequest.findUnique.mockResolvedValue(null);

      await expect(service.declineRequest('bad-id', 99, 'reason')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when request is not pending', async () => {
      prisma.addOnRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APPROVED',
      });

      await expect(service.declineRequest('req-1', 99, 'reason')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveRequest — gifted price', () => {
    it('should set source to gifted when giftedPriceCents is provided', async () => {
      const request = {
        id: 'req-1',
        tenantId: 1,
        addOnId: mockAddOn.id,
        status: 'PENDING',
        addOn: mockAddOn,
      };
      prisma.addOnRequest.findUnique.mockResolvedValue(request);
      prisma.addOn.findUnique.mockResolvedValue(mockAddOn);
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, plan: 'STARTER' });
      prisma.tenantAddOn.upsert.mockResolvedValue({
        id: 'ta-new',
        status: 'ACTIVE',
      });
      prisma.tenantAddOnEvent.create.mockResolvedValue({});

      prisma.$transaction = jest.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const txProxy = { addOnRequest: prisma.addOnRequest };
        return cb(txProxy);
      });
      prisma.addOnRequest.update.mockResolvedValue({
        ...request,
        status: 'APPROVED',
      });

      await service.approveRequest('req-1', 99, 0);

      expect(prisma.addOnRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            giftedPriceCents: 0,
          }),
        }),
      );
    });
  });
});
