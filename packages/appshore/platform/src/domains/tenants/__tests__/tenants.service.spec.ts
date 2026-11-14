import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { TenantsService } from '../tenants.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { NotificationService } from '../../../infrastructure/notification/notification.service';
import { TENANT_PROVISION_HOOKS } from '../../platform-hooks';
import { fixtureModel, walkCursorList } from '../../../test/helpers';

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
  workspaceMember: { create: jest.fn(), upsert: jest.fn() },
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
  tenantApproved: jest.fn().mockResolvedValue(undefined),
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
        { provide: TENANT_PROVISION_HOOKS, useValue: mockDeskBootstrap },
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
      });
      expect(await service.getTenantBranding('acme')).toBeNull();
    });

    it("should return branding for active tenant, with the tenant's public id for the login hint", async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        tenantId: 'ten_acme',
        companyName: 'Acme Inc',
        status: 'ACTIVE',
      });
      const result = await service.getTenantBranding('acme');
      expect(result).toEqual({
        tenantId: 'ten_acme',
        companyName: 'Acme Inc',
        logoUrl: null,
      });
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ tenantId: true }) }),
      );
    });
  });

  describe('registerTenant', () => {
    const dto = {
      companyName: 'Acme Inc',
      subdomain: 'acme',
      email: 'owner@acme.com',
      phone: '+12025551234',
      firstName: 'John',
      lastName: 'Doe',
      firebaseUid: 'firebase-123',
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
        companyName: 'Acme Inc',
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.user.create.mockResolvedValue({ id: 1, userId: 'USR-001' });
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      const result = await service.registerTenant(dto);

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
        companyName: 'Acme Inc',
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.user.create.mockResolvedValue({ id: 1 });
      mockPrisma.tenantPlanEvent.create.mockResolvedValue({});

      await service.registerTenant(dto);

      expect(mockNotification.sendTenantRegistrationConfirmation).toHaveBeenCalledWith(
        'TNT-001',
        'owner@acme.com',
        'John',
        'Acme Inc',
      );
    });
  });

  describe('approveTenant', () => {
    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.approveTenant('TNT-001', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('answers 409 INVALID_STATE if the tenant is not PENDING_APPROVAL', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'TNT-001',
        status: 'ACTIVE',
        users: [],
      });

      await expect(service.approveTenant('TNT-001', 'admin')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
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
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.userPreferences.upsert.mockResolvedValue({});

      await service.approveTenant('TNT-001', 'admin-user');

      // Desk bootstrap receives the tenant's DB id — not the string tenantId.
      expect(mockDeskBootstrap.tenantApproved).toHaveBeenCalledWith(42);
      expect(mockDeskBootstrap.tenantApproved).toHaveBeenCalledTimes(1);
    });
  });

  describe('suspendTenant', () => {
    it('answers 409 INVALID_STATE if the tenant is not ACTIVE', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING_APPROVAL',
        users: [],
      });

      await expect(service.suspendTenant('TNT-001', 'Violation of TOS - repeated', 'admin')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
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
    it('answers 409 INVALID_STATE if the tenant is not SUSPENDED', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        users: [],
      });

      await expect(service.reactivateTenant('TNT-001', 'admin')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
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
    it('should return null logoUrl for an active tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        tenantId: 'ten_acme',
        companyName: 'Acme Inc',
        status: 'ACTIVE',
      });
      const result = await service.getTenantBranding('acme');
      expect(result).toEqual({
        tenantId: 'ten_acme',
        companyName: 'Acme Inc',
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
      });

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

  describe('listTenants: a cursor list by company name', () => {
    // Two pairs share a company name: the public tenant id splits them.
    const names = ['Acme', 'Acme', 'Bolt', 'Cargo', 'Cargo', 'Dune', 'Echo'];
    const rows = names.map((companyName, index) => ({
      id: 100 - index,
      tenantId: `tnt_${String.fromCharCode(103 - index)}`,
      companyName,
      subdomain: companyName.toLowerCase(),
      contactEmail: `ops@${companyName.toLowerCase()}.test`,
      status: index === 6 ? 'SUSPENDED' : 'ACTIVE',
      users: [],
      _count: { users: 1 },
    }));

    beforeEach(() => Object.assign(mockPrisma.tenant, fixtureModel(rows)));

    it('walks every tenant once in name order, same-name tenants included', async () => {
      const { pages, items } = await walkCursorList((cursor) => service.listTenants({ limit: 2, cursor }));

      expect(pages.map((page) => page.length)).toEqual([2, 2, 2, 1]);
      expect(items.map((tenant) => tenant.companyName)).toEqual(names);
      expect(new Set(items.map((tenant) => tenant.tenantId)).size).toBe(7);
    });

    it('orders by company name then the public tenant id, never the Int key', async () => {
      await service.listTenants();
      expect(mockPrisma.tenant.findMany.mock.calls[0][0]).toMatchObject({
        orderBy: [{ companyName: 'asc' }, { tenantId: 'asc' }],
        take: 51,
      });
    });

    it('filters by status and search, and the total counts only what matches', async () => {
      expect(await service.listTenants({ status: 'SUSPENDED' as never })).toMatchObject({ total: 1 });
      const found = await service.listTenants({ q: 'carg', limit: 1 });
      expect(found.total).toBe(2);
      expect(found.items).toHaveLength(1);
      expect(found.nextCursor).not.toBeNull();
    });

    it('keeps the search on every page: the keyset never replaces the search OR', async () => {
      // "c" matches Acme, Acme, Cargo, Cargo and Echo (not Bolt or Dune); a page boundary falls between the Cargos.
      const { pages, items } = await walkCursorList(async (cursor) => {
        const page = await service.listTenants({ q: 'c', limit: 3, cursor });
        expect(page.total).toBe(5);
        return page;
      });

      expect(pages.map((page) => page.length)).toEqual([3, 2]);
      expect(items.map((tenant) => tenant.companyName)).toEqual(['Acme', 'Acme', 'Cargo', 'Cargo', 'Echo']);
      expect(new Set(items.map((tenant) => tenant.tenantId)).size).toBe(5);
    });

    it('escapes LIKE wildcards in the search, so "_" does not match every tenant', async () => {
      await service.listTenants({ q: '_' });
      expect(mockPrisma.tenant.findMany.mock.calls[0][0].where.OR[0]).toEqual({
        companyName: { contains: '\\_', mode: 'insensitive' },
      });
    });

    it('answers 400 on a cursor it did not issue, before any query runs', async () => {
      await expect(service.listTenants({ cursor: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
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
        _count: { users: 3 },
      });

      const result = await service.getTenantDetails('TNT-001');

      expect(result.tenant.tenantId).toBe('TNT-001');
      expect(result.metrics.totalUsers).toBe(3);
    });
  });
});
