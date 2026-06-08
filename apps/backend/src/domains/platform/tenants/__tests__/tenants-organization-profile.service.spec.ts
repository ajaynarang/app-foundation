import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CarrierType, FleetSize } from '@prisma/client';

import { TenantsService } from '../tenants.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { DeskBootstrapService } from '../../../desk/responsibilities/desk-bootstrap.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';

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
        { provide: SallyCacheService, useValue: cache },
        { provide: NotificationService, useValue: {} },
        { provide: DeskBootstrapService, useValue: {} },
        { provide: DomainEventService, useValue: { emit: jest.fn() } },
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
        dotNumber: '1234567',
        mcNumber: '987654',
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: FleetSize.SIZE_11_50,
        timezone: 'America/Chicago',
      });

      const result = await service.updateMyOrganizationProfile(5, {
        companyName: 'Acme',
        contactEmail: 'ops@acme.com',
        contactPhone: '+15125550123',
        dotNumber: '1234567',
        mcNumber: '987654',
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: FleetSize.SIZE_11_50,
        timezone: 'America/Chicago',
      });

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          companyName: 'Acme',
          contactEmail: 'ops@acme.com',
          contactPhone: '+15125550123',
          dotNumber: '1234567',
          mcNumber: '987654',
          carrierType: CarrierType.FOR_HIRE_INTERSTATE,
          fleetSize: FleetSize.SIZE_11_50,
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
        dotNumber: null,
        mcNumber: null,
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: null,
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
        dotNumber: null,
        mcNumber: null,
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: null,
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
        dotNumber: '1234567',
        mcNumber: '987654',
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: FleetSize.SIZE_11_50,
        timezone: 'America/Chicago',
      });

      const result = await service.getMyOrganizationProfile(5);

      expect(result).toEqual({
        companyName: 'Acme',
        contactEmail: 'ops@acme.com',
        contactPhone: '+15125550123',
        dotNumber: '1234567',
        mcNumber: '987654',
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: FleetSize.SIZE_11_50,
        timezone: 'America/Chicago',
      });
    });

    it('falls back to the default timezone when the tenant has none', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Acme',
        contactEmail: null,
        contactPhone: null,
        dotNumber: null,
        mcNumber: null,
        carrierType: CarrierType.FOR_HIRE_INTERSTATE,
        fleetSize: null,
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
