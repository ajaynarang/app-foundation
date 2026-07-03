import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { TenantsService } from '../tenants.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { TENANT_PROVISION_HOOKS } from '../../platform-hooks';

describe('TenantsService — organization profile', () => {
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
        { provide: AppCacheService, useValue: cache },
        { provide: NotificationService, useValue: {} },
        { provide: TENANT_PROVISION_HOOKS, useValue: {} },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  describe('updateMyOrganizationProfile', () => {
    it('maps every editable field to the prisma update (contact fields write the tenant, not the owner)', async () => {
      prisma.tenant.update.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: 'ops@acme.com',
        contactPhone: '+15125550123',
        timezone: 'America/Chicago',
      });

      const result = await service.updateMyOrganizationProfile(5, {
        companyName: 'Acme',
        contactEmail: 'ops@acme.com',
        contactPhone: '+15125550123',
        timezone: 'America/Chicago',
      });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          companyName: 'Acme',
          contactEmail: 'ops@acme.com',
          contactPhone: '+15125550123',
          timezone: 'America/Chicago',
        },
        select: expect.any(Object),
      });
      expect(result.timezone).toBe('America/Chicago');
    });

    it('only maps provided fields (partial update)', async () => {
      prisma.tenant.update.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: null,
        contactPhone: null,
        timezone: 'UTC',
      });

      await service.updateMyOrganizationProfile(5, { timezone: 'UTC' });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { timezone: 'UTC' },
        select: expect.any(Object),
      });
    });

    it('invalidates the me-settings cache after the update', async () => {
      prisma.tenant.update.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: null,
        contactPhone: null,
        timezone: 'UTC',
      });

      await service.updateMyOrganizationProfile(5, { companyName: 'Acme' });

      expect(cache.del).toHaveBeenCalled();
    });

    it('throws NotFound when the tenant does not exist (P2025)', async () => {
      prisma.tenant.update.mockRejectedValue({ code: 'P2025' });

      await expect(service.updateMyOrganizationProfile(999, { companyName: 'Acme' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getMyOrganizationProfile', () => {
    it('returns the editable profile fields with a concrete timezone', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: 'ops@acme.com',
        contactPhone: '+15125550123',
        timezone: 'America/Chicago',
      });

      const result = await service.getMyOrganizationProfile(5);

      expect(result).toEqual({
        companyName: 'Acme',
        contactEmail: 'ops@acme.com',
        contactPhone: '+15125550123',
        timezone: 'America/Chicago',
      });
    });

    it('falls back to the default timezone when the tenant has none', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: null,
        contactPhone: null,
        timezone: null,
      });

      const result = await service.getMyOrganizationProfile(5);

      expect(result.timezone).toBe('UTC');
    });

    it('throws NotFound when the tenant does not exist', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getMyOrganizationProfile(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
