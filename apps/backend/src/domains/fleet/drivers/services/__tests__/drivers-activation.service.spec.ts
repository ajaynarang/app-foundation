import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriversActivationService } from '../drivers-activation.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { UserInvitationsService } from '../../../../platform/user-invitations/user-invitations.service';
import { NotificationTriggersService } from '../../../../operations/notifications/notification-triggers.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('DriversActivationService', () => {
  let service: DriversActivationService;

  const mockPrismaService = {
    driver: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    load: {
      findMany: jest.fn(),
    },
    routePlan: {
      findMany: jest.fn(),
    },
  };

  const mockUserInvitationsService = {
    inviteUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversActivationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: UserInvitationsService,
          useValue: mockUserInvitationsService,
        },
        {
          provide: NotificationTriggersService,
          useValue: {
            driverActivated: jest.fn().mockResolvedValue(undefined),
            driverDeactivated: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DriversActivationService>(DriversActivationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('activateDriver', () => {
    it('should activate pending driver', async () => {
      const mockDriver = {
        id: 1,
        driverId: 'driver_123',
        tenantId: 1,
        status: 'PENDING_ACTIVATION',
      };

      const currentUser = { id: 1, tenant: { id: 1 } };

      mockPrismaService.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrismaService.driver.update.mockResolvedValue({
        ...mockDriver,
        status: 'ACTIVE',
        activatedAt: new Date(),
        activatedBy: currentUser.id,
      });

      const result = await service.activateDriver('driver_123', currentUser);

      expect(result.status).toBe('ACTIVE');
    });

    it('should throw error if driver not found', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(null);

      await expect(service.activateDriver('driver_999', { id: 1, tenant: { id: 1 } })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if driver already active', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
      });

      await expect(service.activateDriver('driver_123', { id: 1, tenant: { id: 1 } })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if driver from different tenant', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING_ACTIVATION',
        tenantId: 2, // Different tenant
      });

      await expect(service.activateDriver('driver_123', { id: 1, tenant: { id: 1 } })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deactivateDriver', () => {
    const activeDriver = {
      id: 1,
      driverId: 'DRV-001',
      tenantId: 1,
      status: 'ACTIVE',
      name: 'John Doe',
    };

    it('should deactivate active driver with no active loads or route plans', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(activeDriver);
      mockPrismaService.load.findMany.mockResolvedValue([]);
      mockPrismaService.routePlan.findMany.mockResolvedValue([]);
      mockPrismaService.driver.update.mockResolvedValue({
        ...activeDriver,
        status: 'INACTIVE',
      });

      const result = await service.deactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } }, 'Left company');

      expect(result.status).toBe('INACTIVE');
      expect(mockPrismaService.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'INACTIVE',
            deactivationReason: 'Left company',
          }),
        }),
      );
    });

    it('should throw NotFoundException when driver not found', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(null);
      await expect(service.deactivateDriver('DRV-999', { id: 1, tenant: { id: 1 } }, 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw when driver belongs to different tenant', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        ...activeDriver,
        tenantId: 2,
      });
      await expect(service.deactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } }, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when driver is not active', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        ...activeDriver,
        status: 'PENDING_ACTIVATION',
      });
      await expect(service.deactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } }, 'reason')).rejects.toThrow(
        'Only active drivers',
      );
    });

    it('should throw ConflictException when driver has active loads', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(activeDriver);
      mockPrismaService.load.findMany.mockResolvedValue([{ loadId: 'LD-001', status: 'IN_TRANSIT' }]);

      await expect(service.deactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } }, 'reason')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when driver has active route plans', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(activeDriver);
      mockPrismaService.load.findMany.mockResolvedValue([]);
      mockPrismaService.routePlan.findMany.mockResolvedValue([{ planId: 'PLN-001' }]);

      await expect(service.deactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } }, 'reason')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('reactivateDriver', () => {
    it('should reactivate inactive driver', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        driverId: 'DRV-001',
        tenantId: 1,
        status: 'INACTIVE',
      });
      mockPrismaService.driver.update.mockResolvedValue({
        driverId: 'DRV-001',
        status: 'ACTIVE',
      });

      const result = await service.reactivateDriver('DRV-001', {
        id: 1,
        tenant: { id: 1 },
      });
      expect(result.status).toBe('ACTIVE');
      expect(mockPrismaService.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          }),
        }),
      );
    });

    it('should throw NotFoundException when driver not found', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue(null);
      await expect(service.reactivateDriver('DRV-999', { id: 1, tenant: { id: 1 } })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw when driver is not INACTIVE', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        driverId: 'DRV-001',
        tenantId: 1,
        status: 'ACTIVE',
      });
      await expect(service.reactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } })).rejects.toThrow(
        'Only inactive drivers',
      );
    });

    it('should throw when driver belongs to different tenant', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        driverId: 'DRV-001',
        tenantId: 2,
        status: 'INACTIVE',
      });
      await expect(service.reactivateDriver('DRV-001', { id: 1, tenant: { id: 1 } })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getInactiveDrivers', () => {
    it('should return inactive drivers with deactivator info', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue([
        {
          driverId: 'DRV-001',
          status: 'INACTIVE',
          deactivatedByUser: {
            userId: 'USR-001',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@test.com',
          },
        },
      ]);

      const result = await service.getInactiveDrivers(1);
      expect(result).toHaveLength(1);
      expect(mockPrismaService.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, status: 'INACTIVE' },
        }),
      );
    });
  });

  describe('getPendingDrivers', () => {
    it('should return pending drivers for tenant', async () => {
      const mockDrivers = [
        { id: 1, driverId: 'driver_1', status: 'PENDING_ACTIVATION' },
        { id: 2, driverId: 'driver_2', status: 'PENDING_ACTIVATION' },
      ];

      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getPendingDrivers(1);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.driver.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1, status: 'PENDING_ACTIVATION' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('activateAndInvite', () => {
    it('should activate driver and create invitation in one step', async () => {
      const mockDriver = {
        id: 1,
        driverId: 'DRV-001',
        name: 'Mike Thompson',
        email: 'mike@email.com',
        tenantId: 1,
        status: 'PENDING_ACTIVATION',
        user: null,
      };

      const currentUser = {
        id: 10,
        userId: 'user_admin1',
        email: 'admin@fleet.com',
        role: 'ADMIN',
        tenantId: 'tenant_abc',
        tenant: { id: 1 },
      };

      mockPrismaService.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrismaService.driver.update.mockResolvedValue({
        ...mockDriver,
        status: 'ACTIVE',
        activatedAt: new Date(),
        activatedBy: currentUser.id,
      });
      mockUserInvitationsService.inviteUser.mockResolvedValue({
        id: 1,
        invitationId: 'inv_abc123',
        email: 'mike@email.com',
        status: 'PENDING',
      });

      const result = await service.activateAndInvite('DRV-001', undefined, currentUser);

      expect(result.driver.status).toBe('ACTIVE');
      expect(result.invitation.status).toBe('PENDING');
      expect(mockUserInvitationsService.inviteUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'mike@email.com',
          firstName: 'Mike',
          lastName: 'Thompson',
          role: 'DRIVER',
          driverId: 'DRV-001',
        }),
        currentUser,
      );
    });

    it('should use provided email when driver has no email', async () => {
      const mockDriver = {
        id: 2,
        driverId: 'DRV-002',
        name: 'Dan Foster',
        email: null,
        tenantId: 1,
        status: 'PENDING_ACTIVATION',
        user: null,
      };

      const currentUser = {
        id: 10,
        userId: 'user_admin1',
        role: 'ADMIN',
        tenantId: 'tenant_abc',
        tenant: { id: 1 },
      };

      mockPrismaService.driver.findUnique.mockResolvedValue(mockDriver);
      mockPrismaService.driver.update.mockResolvedValue({
        ...mockDriver,
        email: 'dan@email.com',
        status: 'ACTIVE',
      });
      mockUserInvitationsService.inviteUser.mockResolvedValue({
        id: 2,
        status: 'PENDING',
      });

      await service.activateAndInvite('DRV-002', 'dan@email.com', currentUser);

      expect(mockPrismaService.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'dan@email.com' }),
        }),
      );
    });

    it('should throw error when driver has no email and none provided', async () => {
      mockPrismaService.driver.findUnique.mockResolvedValue({
        id: 3,
        driverId: 'DRV-003',
        name: 'No Email',
        email: null,
        tenantId: 1,
        status: 'PENDING_ACTIVATION',
        user: null,
      });

      await expect(
        service.activateAndInvite('DRV-003', undefined, {
          id: 10,
          tenant: { id: 1 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should work for already-active drivers (invite only, no status change)', async () => {
      const mockDriver = {
        id: 4,
        driverId: 'DRV-004',
        name: 'Already Active',
        email: 'active@email.com',
        tenantId: 1,
        status: 'ACTIVE',
        user: null,
      };

      const currentUser = {
        id: 10,
        tenant: { id: 1 },
        tenantId: 'tenant_abc',
        role: 'ADMIN',
        userId: 'user_admin1',
      };

      mockPrismaService.driver.findUnique.mockResolvedValue(mockDriver);
      mockUserInvitationsService.inviteUser.mockResolvedValue({
        id: 3,
        status: 'PENDING',
      });

      const result = await service.activateAndInvite('DRV-004', undefined, currentUser);

      expect(result.invitation.status).toBe('PENDING');
    });
  });
});
