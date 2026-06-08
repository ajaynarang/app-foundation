import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { TenantsService } from '../tenants.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';
import { NotificationService } from '../../../../infrastructure/notification/notification.service';
import { DeskBootstrapService } from '../../../desk/responsibilities/desk-bootstrap.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
  },
  tenantPlanEvent: { create: jest.fn() },
  fleetOperationsSettings: { upsert: jest.fn() },
  userPreferences: { upsert: jest.fn() },
  $transaction: jest.fn((cb: any) => cb(mockPrisma)),
};

const mockCache = {
  getOrSet: jest.fn((_key: string, factory: () => Promise<any>) => factory()),
  del: jest.fn().mockResolvedValue(undefined),
};

const mockNotification = {
  sendTenantRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
  sendTenantApprovalNotification: jest.fn().mockResolvedValue(undefined),
  sendTenantRejectionNotification: jest.fn().mockResolvedValue(undefined),
  sendTenantSuspensionNotification: jest.fn().mockResolvedValue(undefined),
  sendTenantReactivationNotification: jest.fn().mockResolvedValue(undefined),
};

const mockDeskBootstrap = {
  bootstrapForTenant: jest.fn().mockResolvedValue(undefined),
  sweepActiveTenants: jest.fn().mockResolvedValue({
    tenantsProcessed: 0,
    agentsUpserted: 0,
    responsibilitiesUpserted: 0,
  }),
};

describe('TenantsService', () => {
  let service: TenantsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppCacheService, useValue: mockCache },
        { provide: NotificationService, useValue: mockNotification },
        { provide: DeskBootstrapService, useValue: mockDeskBootstrap },
        { provide: DomainEventService, useValue: { emit: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('checkSubdomainAvailability', () => {
    it('should return false for reserved subdomains', async () => {
      expect(await service.checkSubdomainAvailability('admin')).toBe(false);
      expect(await service.checkSubdomainAvailability('API')).toBe(false);
      expect(await service.checkSubdomainAvailability('www')).toBe(false);
    });

    it('should return false if subdomain already taken', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 1 });
      expect(await service.checkSubdomainAvailability('acme')).toBe(false);
    });

    it('should return true if subdomain is available', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      expect(await service.checkSubdomainAvailability('acme')).toBe(true);
    });
  });

  describe('getTenantBranding', () => {
    it('should return null for non-existent tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      expect(await service.getTenantBranding('acme')).toBeNull();
    });

    it('should return null for non-ACTIVE tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Acme',
        status: 'SUSPENDED',
        invoiceSettings: null,
      });
      expect(await service.getTenantBranding('acme')).toBeNull();
    });

    it('should return branding for active tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Acme Freight',
        status: 'ACTIVE',
        invoiceSettings: { logoUrl: 'https://example.com/logo.png' },
      });
      const result = await service.getTenantBranding('acme');
      expect(result).toEqual({
        companyName: 'Acme Freight',
        logoUrl: 'https://example.com/logo.png',
      });
    });
  });

  describe('registerTenant', () => {
    const dto = {
      companyName: 'Acme Freight',
      subdomain: 'acme',
      email: 'owner@acme.com',
      phone: '+12025551234',
      firstName: 'John',
      lastName: 'Doe',
      firebaseUid: 'firebase-123',
      dotNumber: 'DOT123',
      carrierType: 'CARRIER',
      fleetSize: 10,
    };

    it('should throw ConflictException for taken subdomain', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.registerTenant(dto as any)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for existing email', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.registerTenant(dto as any)).rejects.toThrow(ConflictException);
    });

    it('should create tenant with PENDING_APPROVAL status and TRIAL plan', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'Acme Freight',
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.user.create.mockResolvedValue({ id: 1, userId: 'USR-001' });
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      const result = await service.registerTenant(dto as any);

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(result.tenantId).toBe('TNT-001');
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PENDING_APPROVAL',
          plan: 'TRIAL',
          isActive: false,
        }),
      });
    });

    it('should send registration confirmation email', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.tenant.create.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'Acme Freight',
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.user.create.mockResolvedValue({ id: 1 });
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      await service.registerTenant(dto as any);

      expect(mockNotification.sendTenantRegistrationConfirmation).toHaveBeenCalledWith(
        'TNT-001',
        'owner@acme.com',
        'John',
        'Acme Freight',
      );
    });
  });

  describe('approveTenant', () => {
    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.approveTenant('TNT-001', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('should throw if tenant is not PENDING_APPROVAL', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        status: 'ACTIVE',
        users: [],
      });

      await expect(service.approveTenant('TNT-001', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('should approve tenant and activate users', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        status: 'PENDING_APPROVAL',
        users: [{ id: 10, role: 'OWNER', email: 'owner@acme.com', firstName: 'John' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({
        companyName: 'Acme',
        subdomain: 'acme',
      });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.fleetOperationsSettings.upsert.mockResolvedValue({});
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.userPreferences.upsert.mockResolvedValue({});

      await service.approveTenant('TNT-001', 'admin-user');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { tenantId: 'TNT-001' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          isActive: true,
          approvedBy: 'admin-user',
        }),
      });
    });

    it('should bootstrap Desk (12 agents + 10 responsibilities) for the newly-approved tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 42,
        tenantId: 'TNT-001',
        status: 'PENDING_APPROVAL',
        users: [{ id: 10, role: 'OWNER', email: 'owner@acme.com', firstName: 'John' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({
        companyName: 'Acme',
        subdomain: 'acme',
      });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.fleetOperationsSettings.upsert.mockResolvedValue({});
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.userPreferences.upsert.mockResolvedValue({});

      await service.approveTenant('TNT-001', 'admin-user');

      // Desk bootstrap receives the tenant's DB id — not the string tenantId.
      expect(mockDeskBootstrap.bootstrapForTenant).toHaveBeenCalledWith(42);
      expect(mockDeskBootstrap.bootstrapForTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('suspendTenant', () => {
    it('should throw if tenant is not ACTIVE', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING_APPROVAL',
        users: [],
      });

      await expect(service.suspendTenant('TNT-001', 'Violation of TOS - repeated', 'admin')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should require reason of at least 10 characters', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        users: [],
      });

      await expect(service.suspendTenant('TNT-001', 'short', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('should suspend tenant and deactivate users', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        users: [{ role: 'OWNER', email: 'o@a.com', firstName: 'J' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({ companyName: 'Acme' });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 5 });

      await service.suspendTenant('TNT-001', 'Violation of TOS policy', 'admin');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { tenantId: 'TNT-001' },
        data: expect.objectContaining({
          status: 'SUSPENDED',
          isActive: false,
        }),
      });
    });
  });

  describe('reactivateTenant', () => {
    it('should throw if tenant is not SUSPENDED', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        users: [],
      });

      await expect(service.reactivateTenant('TNT-001', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('should reactivate and re-enable users', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'SUSPENDED',
        users: [{ role: 'OWNER', email: 'o@a.com', firstName: 'J' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({ companyName: 'Acme' });
      mockPrisma.user.updateMany.mockResolvedValue({ count: 5 });

      await service.reactivateTenant('TNT-001', 'admin');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { tenantId: 'TNT-001' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          isActive: true,
        }),
      });
    });
  });

  describe('updateTenant', () => {
    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.updateTenant('TNT-001', { companyName: 'New' } as any)).rejects.toThrow(BadRequestException);
    });

    it('should check subdomain availability when changing subdomain', async () => {
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce({
          id: 1,
          subdomain: 'old',
          users: [],
        })
        .mockResolvedValueOnce({ id: 2 }); // subdomain taken

      await expect(service.updateTenant('TNT-001', { subdomain: 'admin' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('rejectTenant', () => {
    it('should reject tenant and send notification', async () => {
      mockPrisma.tenant.findUnique.mockReset();
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'Acme',
        users: [{ role: 'OWNER', email: 'o@a.com', firstName: 'J' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({
        status: 'REJECTED',
        companyName: 'Acme',
      });

      await service.rejectTenant('TNT-001', 'Insufficient documentation');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { tenantId: 'TNT-001' },
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'Insufficient documentation',
        }),
      });
      expect(mockNotification.sendTenantRejectionNotification).toHaveBeenCalledWith(
        'TNT-001',
        'o@a.com',
        'J',
        'Acme',
        'Insufficient documentation',
      );
    });

    it('should throw when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockReset();
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.rejectTenant('TNT-999', 'reason')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTenantBranding — with null logoUrl', () => {
    it('should return null logoUrl when invoiceSettings is null', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Acme Freight',
        status: 'ACTIVE',
        invoiceSettings: null,
      });
      const result = await service.getTenantBranding('acme');
      expect(result).toEqual({
        companyName: 'Acme Freight',
        logoUrl: null,
      });
    });
  });

  describe('updateTenant — with owner fields', () => {
    it('should update both tenant and owner user fields', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        subdomain: 'acme',
        users: [{ id: 10, role: 'OWNER' }],
      });
      mockPrisma.tenant.update.mockResolvedValue({});
      mockPrisma.user.update = jest.fn().mockResolvedValue({});

      await service.updateTenant('TNT-001', {
        companyName: 'New Acme',
        ownerFirstName: 'Jane',
        ownerLastName: 'Smith',
        ownerEmail: 'jane@acme.com',
        ownerPhone: '+12025559999',
      } as any);

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyName: 'New Acme',
            contactEmail: 'jane@acme.com',
            contactPhone: '+12025559999',
          }),
        }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@acme.com',
        }),
      });
    });
  });

  describe('getAllTenants', () => {
    it('should return all tenants with admin users', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        {
          id: 1,
          companyName: 'Acme',
          users: [],
          _count: { users: 5, drivers: 10 },
        },
      ]);

      const result = await service.getAllTenants();

      expect(result).toHaveLength(1);
    });

    it('should filter by status', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      await service.getAllTenants('ACTIVE');

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'ACTIVE' },
        }),
      );
    });
  });

  describe('suspendTenant — not found', () => {
    it('should throw when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockReset();
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.suspendTenant('TNT-999', 'Violation of TOS policy', 'admin')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reactivateTenant — not found', () => {
    it('should throw when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockReset();
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.reactivateTenant('TNT-999', 'admin')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTenantDetails', () => {
    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockReset();
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getTenantDetails('TNT-999')).rejects.toThrow(BadRequestException);
    });

    it('should return formatted tenant details with metrics', async () => {
      const now = new Date();
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        companyName: 'Acme',
        subdomain: 'acme',
        status: 'ACTIVE',
        dotNumber: 'DOT123',
        carrierType: 'CARRIER',
        mcNumber: null,
        fleetSize: 5,
        contactEmail: 'test@acme.com',
        contactPhone: '+1234',
        createdAt: now,
        approvedAt: now,
        approvedBy: 'admin',
        rejectedAt: null,
        rejectionReason: null,
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
        reactivatedAt: null,
        reactivatedBy: null,
        users: [],
        _count: { users: 3, drivers: 10, vehicles: 8, routePlans: 5 },
      });

      const result = await service.getTenantDetails('TNT-001');

      expect(result.tenant.tenantId).toBe('TNT-001');
      expect(result.metrics.totalDrivers).toBe(10);
      expect(result.metrics.totalVehicles).toBe(8);
    });
  });
});
