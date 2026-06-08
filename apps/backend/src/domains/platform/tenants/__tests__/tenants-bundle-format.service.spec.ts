import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantsService } from '../tenants.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { DeskBootstrapService } from '../../../desk/responsibilities/desk-bootstrap.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';

describe('TenantsService — bundle format', () => {
  let service: TenantsService;
  let prisma: { tenant: { update: jest.Mock; findUnique: jest.Mock } };
  let cache: { del: jest.Mock; getOrSet: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tenant: { update: jest.fn(), findUnique: jest.fn() },
    };
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      // Bypass cache wrapper so we can assert prisma calls directly.
      getOrSet: jest.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: NotificationService, useValue: { sendTenantRegistrationConfirmation: jest.fn() } },
        { provide: DeskBootstrapService, useValue: { bootstrapForTenant: jest.fn() } },
        { provide: DomainEventService, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  describe('setBundleFormat', () => {
    it('updates bundleFormat to ZIP and invalidates the me-settings cache', async () => {
      prisma.tenant.update.mockResolvedValue({ id: 1, bundleFormat: 'ZIP' });

      const result = await service.setBundleFormat(1, 'ZIP');

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { bundleFormat: 'ZIP' },
        select: { id: true, bundleFormat: true },
      });
      expect(cache.del).toHaveBeenCalledWith(expect.stringContaining('me-settings'));
      expect(result).toEqual({ format: 'ZIP' });
    });

    it('updates bundleFormat to MERGED_PDF', async () => {
      prisma.tenant.update.mockResolvedValue({ id: 1, bundleFormat: 'MERGED_PDF' });

      const result = await service.setBundleFormat(1, 'MERGED_PDF');

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { bundleFormat: 'MERGED_PDF' },
        select: { id: true, bundleFormat: true },
      });
      expect(result).toEqual({ format: 'MERGED_PDF' });
    });

    it('rejects an invalid format value via the schema layer (defensive defense-in-depth past the DTO)', async () => {
      await expect(service.setBundleFormat(1, 'XML' as never)).rejects.toThrow();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('translates Prisma P2025 (record not found) into a NotFoundException', async () => {
      prisma.tenant.update.mockRejectedValue(Object.assign(new Error('P2025'), { code: 'P2025' }));

      await expect(service.setBundleFormat(999, 'ZIP')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not affect a sibling tenant — update is keyed by id only', async () => {
      prisma.tenant.update.mockResolvedValue({ id: 1, bundleFormat: 'ZIP' });

      await service.setBundleFormat(1, 'ZIP');

      // Single update call, scoped to id=1. Cross-tenant guarantee is the
      // controller resolving tenantDbId from the JWT — service is keyed.
      expect(prisma.tenant.update).toHaveBeenCalledTimes(1);
      expect(prisma.tenant.update.mock.calls[0][0].where).toEqual({ id: 1 });
    });
  });

  describe('setDriverPayTiming (Phase 4C)', () => {
    it('updates driverPayTiming to ON_FACTOR_FUND and invalidates the me-settings cache', async () => {
      prisma.tenant.update.mockResolvedValue({ id: 1, driverPayTiming: 'ON_FACTOR_FUND' });

      const result = await service.setDriverPayTiming(1, 'ON_FACTOR_FUND');

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { driverPayTiming: 'ON_FACTOR_FUND' },
        select: { id: true, driverPayTiming: true },
      });
      expect(cache.del).toHaveBeenCalledWith(expect.stringContaining('me-settings'));
      expect(result).toEqual({ timing: 'ON_FACTOR_FUND' });
    });

    it('updates driverPayTiming to ON_DELIVERY', async () => {
      prisma.tenant.update.mockResolvedValue({ id: 1, driverPayTiming: 'ON_DELIVERY' });

      const result = await service.setDriverPayTiming(1, 'ON_DELIVERY');

      expect(result).toEqual({ timing: 'ON_DELIVERY' });
    });

    it('rejects an invalid timing value via schema layer', async () => {
      await expect(service.setDriverPayTiming(1, 'NEXT_TUESDAY' as never)).rejects.toThrow();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('translates Prisma P2025 (record not found) into a NotFoundException', async () => {
      prisma.tenant.update.mockRejectedValue(Object.assign(new Error('P2025'), { code: 'P2025' }));

      await expect(service.setDriverPayTiming(999, 'ON_FACTOR_FUND')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMyTenantSettings', () => {
    it('includes bundleFormat in the cached me-settings payload', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        defaultFactoringCompanyId: 5,
        defaultFactoringCompany: { id: 5, companyId: 'fc-5', companyName: 'F' },
        bundleFormat: 'MERGED_PDF',
        driverPayTiming: 'ON_DELIVERY',
      });

      const result = await service.getMyTenantSettings(1);

      expect(result).toEqual({
        factoringCompanyId: 5,
        factoringCompany: { id: 5, companyId: 'fc-5', companyName: 'F' },
        bundleFormat: 'MERGED_PDF',
        driverPayTiming: 'ON_DELIVERY',
      });
    });

    it('falls back to ZIP when the tenant row has no bundleFormat (null tenant — defensive)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      const result = await service.getMyTenantSettings(1);

      expect(result.bundleFormat).toBe('ZIP');
      expect(result.factoringCompanyId).toBeNull();
      expect(result.factoringCompany).toBeNull();
    });
  });
});
