import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantsService } from '../tenants.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { DeskBootstrapService } from '../../../desk/responsibilities/desk-bootstrap.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

describe('TenantsService — factoring default', () => {
  let service: TenantsService;
  let prisma: { factoringCompany: { findFirst: jest.Mock }; tenant: { update: jest.Mock; findUnique: jest.Mock } };
  let cache: { del: jest.Mock; getOrSet: jest.Mock };
  let events: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      factoringCompany: { findFirst: jest.fn() },
      tenant: { update: jest.fn(), findUnique: jest.fn() },
    };
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      // Bypass cache wrapper so we can assert prisma calls directly.
      getOrSet: jest.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    };
    events = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: NotificationService, useValue: { sendTenantRegistrationConfirmation: jest.fn() } },
        { provide: DeskBootstrapService, useValue: { bootstrapForTenant: jest.fn() } },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  describe('setDefaultFactoringCompany', () => {
    it('pins a factoring company that belongs to the same tenant', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId: 1, companyId: 'fc_abc' });
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, defaultFactoringCompanyId: null });
      prisma.tenant.update.mockResolvedValue({ id: 1, defaultFactoringCompanyId: 7 });

      const result = await service.setDefaultFactoringCompany(1, 7, 'user_42');

      expect(prisma.factoringCompany.findFirst).toHaveBeenCalledWith({ where: { id: 7, tenantId: 1 } });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { defaultFactoringCompanyId: 7 },
        select: { id: true, defaultFactoringCompanyId: true },
      });
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TENANT_FACTORING_DEFAULT_CHANGED,
        1,
        expect.objectContaining({ previousFactoringCompanyId: null, newFactoringCompanyId: 7, changedBy: 'user_42' }),
      );
      expect(result.factoringCompanyId).toBe(7);
    });

    it('unpins when factoringCompanyId is null', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, defaultFactoringCompanyId: 7 });
      prisma.tenant.update.mockResolvedValue({ id: 1, defaultFactoringCompanyId: null });

      const result = await service.setDefaultFactoringCompany(1, null, 'user_42');

      expect(prisma.factoringCompany.findFirst).not.toHaveBeenCalled();
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { defaultFactoringCompanyId: null },
        select: { id: true, defaultFactoringCompanyId: true },
      });
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TENANT_FACTORING_DEFAULT_CHANGED,
        1,
        expect.objectContaining({ previousFactoringCompanyId: 7, newFactoringCompanyId: null }),
      );
      expect(result.factoringCompanyId).toBeNull();
    });

    it('rejects a factoring company from a different tenant', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue(null);

      await expect(service.setDefaultFactoringCompany(1, 999, 'user_42')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId: 1 });
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.setDefaultFactoringCompany(1, 7, 'user_42')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('skips event emission when value is unchanged', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId: 1 });
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, defaultFactoringCompanyId: 7 });
      prisma.tenant.update.mockResolvedValue({ id: 1, defaultFactoringCompanyId: 7 });

      await service.setDefaultFactoringCompany(1, 7, 'user_42');

      expect(events.emit).not.toHaveBeenCalled();
    });

    it('invalidates the tenant settings cache after writing', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId: 1 });
      prisma.tenant.findUnique.mockResolvedValue({ id: 1, defaultFactoringCompanyId: null });
      prisma.tenant.update.mockResolvedValue({ id: 1, defaultFactoringCompanyId: 7 });

      await service.setDefaultFactoringCompany(1, 7, 'user_42');

      expect(cache.del).toHaveBeenCalledWith(expect.stringContaining('me-settings'));
    });
  });

  describe('getMyTenantSettings', () => {
    it('returns the tenant-default factor with company info when set', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        defaultFactoringCompanyId: 7,
        defaultFactoringCompany: { id: 7, companyId: 'fc_abc', companyName: 'OTR Solutions' },
        bundleFormat: 'ZIP',
        driverPayTiming: 'ON_DELIVERY',
      });

      const result = await service.getMyTenantSettings(1);

      expect(result).toEqual({
        factoringCompanyId: 7,
        factoringCompany: { id: 7, companyId: 'fc_abc', companyName: 'OTR Solutions' },
        bundleFormat: 'ZIP',
        driverPayTiming: 'ON_DELIVERY',
      });
    });

    it('returns null company when no factor pinned', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        defaultFactoringCompanyId: null,
        defaultFactoringCompany: null,
        bundleFormat: 'ZIP',
        driverPayTiming: 'ON_DELIVERY',
      });

      const result = await service.getMyTenantSettings(1);

      expect(result).toEqual({
        factoringCompanyId: null,
        factoringCompany: null,
        bundleFormat: 'ZIP',
        driverPayTiming: 'ON_DELIVERY',
      });
    });

    it('returns null when tenant lookup misses entirely (defaults bundleFormat to ZIP)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      const result = await service.getMyTenantSettings(1);

      expect(result).toEqual({
        factoringCompanyId: null,
        factoringCompany: null,
        bundleFormat: 'ZIP',
        driverPayTiming: 'ON_DELIVERY',
      });
    });
  });
});
