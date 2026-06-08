import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfitabilityController } from '../profitability.controller';
import { ProfitabilityService } from '../../services/profitability.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('ProfitabilityController', () => {
  let controller: ProfitabilityController;

  const mockTenant = { id: 5, tenantId: 'tenant-fin' };

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-fin',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
  };

  const mockProfitabilityService = {
    calculateForLoad: jest.fn(),
    calculateForTenant: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfitabilityController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfitabilityService, useValue: mockProfitabilityService },
      ],
    }).compile();

    controller = module.get<ProfitabilityController>(ProfitabilityController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Tenant resolution ──

  describe('tenant resolution', () => {
    it('resolves tenantDbId from user.tenantId via Prisma', async () => {
      mockProfitabilityService.calculateForLoad.mockResolvedValue({});

      await controller.getForLoad(mockUser, 'ld-001');

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-fin' },
      });
    });

    it('throws NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(controller.getForLoad(mockUser, 'ld-001')).rejects.toThrow(NotFoundException);
    });

    it('passes tenant.id (not user.dbId) to the service', async () => {
      mockProfitabilityService.calculateForLoad.mockResolvedValue({});

      await controller.getForLoad(mockUser, 'ld-001');

      expect(mockProfitabilityService.calculateForLoad).toHaveBeenCalledWith(
        5, // tenant.id, not user.dbId (1)
        'ld-001',
      );
    });
  });

  // ── GET /loads/:load_id ──

  describe('getForLoad', () => {
    const fullProfitability = {
      loadNumber: 'LD-1001',
      revenueCents: 350000,
      driverCostCents: 80000,
      fuelCostCents: 43077,
      marginCents: 226923,
      marginPercent: 64.8,
    };

    it('returns a profitability object with all expected fields', async () => {
      mockProfitabilityService.calculateForLoad.mockResolvedValue(fullProfitability);

      const result = await controller.getForLoad(mockUser, 'ld-001');

      expect(result).toEqual(fullProfitability);
      expect(result.revenueCents).toBe(350000);
      expect(result.driverCostCents).toBe(80000);
      expect(result.fuelCostCents).toBe(43077);
      expect(result.marginCents).toBe(226923);
      expect(result.marginPercent).toBe(64.8);
    });

    it('passes the exact loadId param to service', async () => {
      mockProfitabilityService.calculateForLoad.mockResolvedValue(fullProfitability);

      await controller.getForLoad(mockUser, 'ld-custom-id-999');

      expect(mockProfitabilityService.calculateForLoad).toHaveBeenCalledWith(5, 'ld-custom-id-999');
    });

    it('propagates NotFoundException when load does not exist', async () => {
      mockProfitabilityService.calculateForLoad.mockRejectedValue(new NotFoundException('Load not found'));

      await expect(controller.getForLoad(mockUser, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('propagates service errors', async () => {
      mockProfitabilityService.calculateForLoad.mockRejectedValue(new Error('Calculation error'));

      await expect(controller.getForLoad(mockUser, 'ld-001')).rejects.toThrow('Calculation error');
    });
  });

  // ── GET /loads ──

  describe('getForTenant', () => {
    const profitabilityList = [
      {
        loadNumber: 'LD-1',
        revenueCents: 200000,
        driverCostCents: 50000,
        fuelCostCents: 20000,
        marginCents: 130000,
        marginPercent: 65.0,
      },
      {
        loadNumber: 'LD-2',
        revenueCents: 150000,
        driverCostCents: 40000,
        fuelCostCents: 15000,
        marginCents: 95000,
        marginPercent: 63.3,
      },
    ];

    it('uses default limit of 50 when no limit parameter provided', async () => {
      mockProfitabilityService.calculateForTenant.mockResolvedValue([]);

      await controller.getForTenant(mockUser);

      expect(mockProfitabilityService.calculateForTenant).toHaveBeenCalledWith(5, 50);
    });

    it('converts string limit param to number', async () => {
      mockProfitabilityService.calculateForTenant.mockResolvedValue([]);

      await controller.getForTenant(mockUser, '25');

      expect(mockProfitabilityService.calculateForTenant).toHaveBeenCalledWith(5, 25);
    });

    it('returns profitability list with correct structure', async () => {
      mockProfitabilityService.calculateForTenant.mockResolvedValue(profitabilityList);

      const result = await controller.getForTenant(mockUser, '50');

      expect(result).toHaveLength(2);
      expect(result[0].revenueCents).toBe(200000);
      expect(result[0].marginPercent).toBe(65.0);
      expect(result[1].marginCents).toBe(95000);
    });

    it('returns empty array when no delivered loads exist', async () => {
      mockProfitabilityService.calculateForTenant.mockResolvedValue([]);

      const result = await controller.getForTenant(mockUser, '50');

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('propagates service errors', async () => {
      mockProfitabilityService.calculateForTenant.mockRejectedValue(new Error('Database timeout'));

      await expect(controller.getForTenant(mockUser, '10')).rejects.toThrow('Database timeout');
    });
  });

  // ── Tenant isolation ──

  describe('tenant isolation', () => {
    it('different users resolve to different tenantDbIds', async () => {
      const otherTenant = { id: 99, tenantId: 'tenant-other' };
      mockPrisma.tenant.findUnique.mockResolvedValue(otherTenant);
      mockProfitabilityService.calculateForTenant.mockResolvedValue([]);

      const otherUser = { ...mockUser, tenantId: 'tenant-other' };
      await controller.getForTenant(otherUser, '10');

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-other' },
      });
      expect(mockProfitabilityService.calculateForTenant).toHaveBeenCalledWith(99, 10);
    });
  });
});
