// Mock ESM modules before imports
jest.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid-id',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MoneyCodesController } from '../money-codes.controller';
import { MoneyCodeService } from '../../services/money-code.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('MoneyCodesController', () => {
  let controller: MoneyCodesController;

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const driverUser = {
    userId: 'user-2',
    tenantId: 'tenant-1',
    dbId: 2,
    role: 'DRIVER',
    driverDbId: 5,
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    load: { findFirst: jest.fn() },
  };

  const mockMoneyCodeService = {
    create: jest.fn(),
    approve: jest.fn(),
    deny: jest.fn(),
    markUsed: jest.fn(),
    cancel: jest.fn(),
    getByLoad: jest.fn(),
    getById: jest.fn(),
    issueProactively: jest.fn(),
    getLumperInsights: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoneyCodesController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MoneyCodeService, useValue: mockMoneyCodeService },
      ],
    }).compile();

    controller = module.get<MoneyCodesController>(MoneyCodesController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── POST / (create) ──

  describe('create', () => {
    it('creates money code as dispatcher', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 5,
      });
      mockMoneyCodeService.create.mockResolvedValue({ moneyCodeId: 'mc-001' });

      const dto = { requestedCents: 30000, method: 'COMCHEK' } as any;
      const result = await controller.create('LD-100', dto, mockUser);

      expect(mockMoneyCodeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          loadId: 10,
          driverId: 5,
          requestedCents: 30000,
          method: 'COMCHEK',
        }),
      );
      expect(result.moneyCodeId).toBe('mc-001');
    });

    it('creates money code as driver assigned to load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 5,
      });
      mockMoneyCodeService.create.mockResolvedValue({ moneyCodeId: 'mc-002' });

      const dto = { requestedCents: 20000, method: 'EFS' } as any;
      const result = await controller.create('LD-100', dto, driverUser);

      expect(mockMoneyCodeService.create).toHaveBeenCalledWith(expect.objectContaining({ driverId: 5 }));
      expect(result.moneyCodeId).toBe('mc-002');
    });

    it('throws NotFoundException if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.create('NOPE', {} as any, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if driver not assigned to load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 99,
      });

      await expect(controller.create('LD-100', {} as any, driverUser)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if dispatcher load has no driver', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: null,
      });

      await expect(controller.create('LD-100', {} as any, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /issue ──

  describe('issue', () => {
    it('proactively issues money code', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 5,
      });
      mockMoneyCodeService.issueProactively.mockResolvedValue({
        moneyCodeId: 'mc-003',
      });

      const dto = {
        code: 'CODE-1',
        amountCents: 25000,
        method: 'COMCHEK',
      } as any;
      const result = await controller.issue('LD-100', dto, mockUser);

      expect(mockMoneyCodeService.issueProactively).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          loadId: 10,
          driverId: 5,
          code: 'CODE-1',
          issuedBy: 1,
        }),
      );
      expect(result.moneyCodeId).toBe('mc-003');
    });

    it('throws NotFoundException if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.issue('NOPE', {} as any, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if no driver on load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: null,
      });

      await expect(controller.issue('LD-100', {} as any, mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── GET /insights ──

  describe('insights', () => {
    it('returns lumper insights', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10 });
      mockMoneyCodeService.getLumperInsights.mockResolvedValue({
        facilityAvg: null,
        driverHistory: null,
        facilityName: null,
      });

      const result = await controller.insights('LD-100', mockUser);
      expect(mockMoneyCodeService.getLumperInsights).toHaveBeenCalledWith(10, 1);
      expect(result.facilityName).toBeNull();
    });

    it('throws NotFoundException if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      await expect(controller.insights('NOPE', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── GET / (list) ──

  describe('list', () => {
    it('returns money codes for a load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10 });
      mockMoneyCodeService.getByLoad.mockResolvedValue([{ moneyCodeId: 'mc-001' }]);

      const result = await controller.list('LD-100', mockUser);
      expect(mockMoneyCodeService.getByLoad).toHaveBeenCalledWith(10, 1);
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      await expect(controller.list('NOPE', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /:moneyCodeId/approve ──

  describe('approve', () => {
    it('approves a money code', async () => {
      mockMoneyCodeService.approve.mockResolvedValue({ status: 'approved' });

      const dto = { code: '1234', amountCents: 30000 } as any;
      const result = await controller.approve('mc-001', dto, mockUser);

      expect(mockMoneyCodeService.approve).toHaveBeenCalledWith(
        expect.objectContaining({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          approvedBy: 1,
          code: '1234',
          amountCents: 30000,
        }),
      );
      expect(result.status).toBe('approved');
    });
  });

  // ── PATCH /:moneyCodeId/deny ──

  describe('deny', () => {
    it('denies a money code', async () => {
      mockMoneyCodeService.deny.mockResolvedValue({ status: 'denied' });

      const dto = { dispatcherNote: 'Nope' } as any;
      const result = await controller.deny('mc-001', dto, mockUser);

      expect(mockMoneyCodeService.deny).toHaveBeenCalledWith(
        expect.objectContaining({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          deniedBy: 1,
        }),
      );
      expect(result.status).toBe('denied');
    });
  });

  // ── PATCH /:moneyCodeId/use ──

  describe('markUsed', () => {
    it('marks money code as used', async () => {
      mockMoneyCodeService.markUsed.mockResolvedValue({ status: 'used' });

      const dto = { actualAmountCents: 28000 } as any;
      const result = await controller.markUsed('mc-001', dto, driverUser);

      expect(mockMoneyCodeService.markUsed).toHaveBeenCalledWith(
        expect.objectContaining({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          actualAmountCents: 28000,
        }),
      );
      expect(result.status).toBe('used');
    });
  });

  // ── PATCH /:moneyCodeId/cancel ──

  describe('cancel', () => {
    it('cancels a money code', async () => {
      mockMoneyCodeService.cancel.mockResolvedValue({ status: 'CANCELLED' });

      const result = await controller.cancel('mc-001', mockUser);

      expect(mockMoneyCodeService.cancel).toHaveBeenCalledWith('mc-001', 1);
      expect(result.status).toBe('CANCELLED');
    });
  });
});
