// Mock ESM modules before imports
jest.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid-id',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DriverActionsController } from '../driver-actions.controller';
import { DriverActionsService } from '../../services/driver-actions.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DriverActionsController', () => {
  let controller: DriverActionsController;

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const driverUser = {
    userId: 'user-2',
    tenantId: 'tenant-1',
    dbId: 2,
    role: 'DRIVER',
    driverDbId: 5,
  };

  const dispatcherUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    load: { findFirst: jest.fn() },
  };

  const mockDriverActionsService = {
    create: jest.fn(),
    acknowledge: jest.fn(),
    resolve: jest.fn(),
    getByLoad: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverActionsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DriverActionsService, useValue: mockDriverActionsService },
      ],
    }).compile();

    controller = module.get<DriverActionsController>(DriverActionsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── POST / (create) ──

  describe('create', () => {
    it('creates a driver action for assigned driver', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 5,
      });
      mockDriverActionsService.create.mockResolvedValue({
        actionRequestId: 'act-001',
      });

      const dto = { actionType: 'detention', note: 'Waiting' } as any;
      const result = await controller.create('LD-100', dto, driverUser);

      expect(mockDriverActionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          loadId: 10,
          driverId: 5,
          actionType: 'detention',
          note: 'Waiting',
        }),
      );
      expect(result.actionRequestId).toBe('act-001');
    });

    it('throws NotFoundException if driver profile not found', async () => {
      const userNoDriver = { ...driverUser, driverDbId: undefined };

      await expect(controller.create('LD-100', {} as any, userNoDriver)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.create('LD-NOPE', {} as any, driverUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if driver not assigned to load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 99,
      });

      await expect(controller.create('LD-100', {} as any, driverUser)).rejects.toThrow(ForbiddenException);
    });

    it('passes stopId and metadata through', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        id: 10,
        driverId: 5,
      });
      mockDriverActionsService.create.mockResolvedValue({
        actionRequestId: 'act-002',
      });

      const dto = {
        actionType: 'scale',
        stopId: 3,
        metadata: { weight: 45000 },
      } as any;
      await controller.create('LD-100', dto, driverUser);

      expect(mockDriverActionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stopId: 3,
          metadata: { weight: 45000 },
        }),
      );
    });
  });

  // ── PATCH /:actionRequestId/acknowledge ──

  describe('acknowledge', () => {
    it('acknowledges a driver action', async () => {
      mockDriverActionsService.acknowledge.mockResolvedValue({
        status: 'acknowledged',
      });

      const result = await controller.acknowledge('act-001', dispatcherUser);

      expect(mockDriverActionsService.acknowledge).toHaveBeenCalledWith('act-001', 1, 1);
      expect(result.status).toBe('acknowledged');
    });
  });

  // ── PATCH /:actionRequestId/resolve ──

  describe('resolve', () => {
    it('resolves a driver action with documentId and loadChargeId', async () => {
      mockDriverActionsService.resolve.mockResolvedValue({
        status: 'resolved',
      });

      const dto = { documentId: 42, loadChargeId: 55 } as any;
      const result = await controller.resolve('act-001', dto, dispatcherUser);

      expect(mockDriverActionsService.resolve).toHaveBeenCalledWith({
        actionRequestId: 'act-001',
        tenantId: 1,
        documentId: 42,
        loadChargeId: 55,
      });
      expect(result.status).toBe('resolved');
    });

    it('resolves without optional fields', async () => {
      mockDriverActionsService.resolve.mockResolvedValue({
        status: 'resolved',
      });

      const dto = {} as any;
      await controller.resolve('act-001', dto, dispatcherUser);

      expect(mockDriverActionsService.resolve).toHaveBeenCalledWith({
        actionRequestId: 'act-001',
        tenantId: 1,
        documentId: undefined,
        loadChargeId: undefined,
      });
    });
  });

  // ── GET / (list) ──

  describe('list', () => {
    it('returns driver actions for a load', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({ id: 10 });
      mockDriverActionsService.getByLoad.mockResolvedValue([{ actionRequestId: 'act-001' }]);

      const result = await controller.list('LD-100', dispatcherUser);

      expect(mockDriverActionsService.getByLoad).toHaveBeenCalledWith(10, 1);
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException if load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(controller.list('LD-NOPE', dispatcherUser)).rejects.toThrow(NotFoundException);
    });
  });
});
