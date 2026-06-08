// Mock ESM module before imports
jest.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid-id',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DriverActionsService } from '../driver-actions.service';
import { AlertTriggersService } from '../../../../operations/alerts/services/alert-triggers.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DriverActionsService', () => {
  let service: DriverActionsService;
  let prisma: any;
  let alertTriggers: any;

  const baseAction = {
    id: 1,
    actionRequestId: 'act-001',
    tenantId: 1,
    loadId: 10,
    stopId: null,
    driverId: 5,
    actionType: 'detention',
    status: 'SUBMITTED',
    note: null,
    metadata: null,
    documentId: null,
    loadChargeId: null,
    acknowledgedAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-04-01T10:00:00Z'),
  };

  beforeEach(async () => {
    prisma = {
      driverActionRequest: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      driver: { findUnique: jest.fn() },
      load: { findUnique: jest.fn() },
    };
    alertTriggers = { trigger: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverActionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertTriggersService, useValue: alertTriggers },
      ],
    }).compile();

    service = module.get<DriverActionsService>(DriverActionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──

  describe('create', () => {
    it('creates an action and fires DETENTION_REPORT alert for detention type', async () => {
      prisma.driverActionRequest.create.mockResolvedValue({ ...baseAction });
      prisma.driver.findUnique.mockResolvedValue({
        driverId: 'DRV-1',
        name: 'John',
      });
      prisma.load.findUnique.mockResolvedValue({ loadNumber: 'LD-100' });

      const result = await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        actionType: 'detention',
        note: 'Waiting 3 hours',
      });

      expect(prisma.driverActionRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          loadId: 10,
          driverId: 5,
          actionType: 'detention',
          status: 'SUBMITTED',
        }),
      });
      expect(alertTriggers.trigger).toHaveBeenCalledWith(
        'DETENTION_REPORT',
        1,
        'DRV-1',
        expect.objectContaining({
          actionType: 'detention',
          priority: 'high',
        }),
      );
      expect(result.actionRequestId).toBe('act-001');
    });

    it('fires ISSUE_REPORT alert with critical priority for issue_report type', async () => {
      prisma.driverActionRequest.create.mockResolvedValue({
        ...baseAction,
        actionType: 'issue_report',
      });
      prisma.driver.findUnique.mockResolvedValue({
        driverId: 'DRV-1',
        name: 'John',
      });
      prisma.load.findUnique.mockResolvedValue({ loadNumber: 'LD-100' });

      await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        actionType: 'issue_report',
      });

      expect(alertTriggers.trigger).toHaveBeenCalledWith(
        'ISSUE_REPORT',
        1,
        'DRV-1',
        expect.objectContaining({ priority: 'critical' }),
      );
    });

    it('does not fire alert for unrecognized action types (fuel, scale)', async () => {
      prisma.driverActionRequest.create.mockResolvedValue({
        ...baseAction,
        actionType: 'fuel',
      });

      await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        actionType: 'fuel',
      });

      expect(alertTriggers.trigger).not.toHaveBeenCalled();
    });

    it('skips alert when driver or load not found', async () => {
      prisma.driverActionRequest.create.mockResolvedValue({ ...baseAction });
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.load.findUnique.mockResolvedValue(null);

      await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        actionType: 'detention',
      });

      expect(alertTriggers.trigger).not.toHaveBeenCalled();
    });

    it('stores metadata as Prisma JSON', async () => {
      const meta = { weight: 45000, overweight: true };
      prisma.driverActionRequest.create.mockResolvedValue({
        ...baseAction,
        metadata: meta,
      });

      const result = await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        actionType: 'scale',
        metadata: meta,
      });

      expect(prisma.driverActionRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metadata: meta }),
      });
      expect(result.metadata).toEqual(meta);
    });
  });

  // ── acknowledge ──

  describe('acknowledge', () => {
    it('acknowledges a submitted action', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
      });
      prisma.driverActionRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.driverActionRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseAction,
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
      });

      const result = await service.acknowledge('act-001', 1, 2);

      expect(prisma.driverActionRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: 'SUBMITTED' },
        data: expect.objectContaining({
          status: 'ACKNOWLEDGED',
          acknowledgedBy: 2,
        }),
      });
      expect(result.status).toBe('ACKNOWLEDGED');
    });

    it('throws BadRequestException if already acknowledged', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
        status: 'ACKNOWLEDGED',
      });

      await expect(service.acknowledge('act-001', 1, 2)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if already resolved', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
        status: 'RESOLVED',
      });

      await expect(service.acknowledge('act-001', 1, 2)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if action not found', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue(null);

      await expect(service.acknowledge('bad', 1, 2)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if tenant does not match', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
        tenantId: 999,
      });

      await expect(service.acknowledge('act-001', 1, 2)).rejects.toThrow(NotFoundException);
    });
  });

  // ── resolve ──

  describe('resolve', () => {
    it('resolves a submitted action', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
      });
      prisma.driverActionRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.driverActionRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseAction,
        status: 'RESOLVED',
        resolvedAt: new Date(),
      });

      const result = await service.resolve({
        actionRequestId: 'act-001',
        tenantId: 1,
        documentId: 42,
        loadChargeId: 55,
      });

      expect(prisma.driverActionRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: { not: 'RESOLVED' } },
        data: expect.objectContaining({
          status: 'RESOLVED',
          documentId: 42,
          loadChargeId: 55,
        }),
      });
      expect(result.status).toBe('RESOLVED');
    });

    it('resolves an acknowledged action', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
        status: 'ACKNOWLEDGED',
        documentId: null,
        loadChargeId: null,
      });
      prisma.driverActionRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.driverActionRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseAction,
        status: 'RESOLVED',
      });

      const result = await service.resolve({
        actionRequestId: 'act-001',
        tenantId: 1,
      });

      expect(result.status).toBe('RESOLVED');
    });

    it('throws BadRequestException if already resolved', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
        status: 'RESOLVED',
      });

      await expect(service.resolve({ actionRequestId: 'act-001', tenantId: 1 })).rejects.toThrow(BadRequestException);
    });

    it('preserves existing documentId when not provided', async () => {
      prisma.driverActionRequest.findUnique.mockResolvedValue({
        ...baseAction,
        documentId: 10,
        loadChargeId: 20,
      });
      prisma.driverActionRequest.updateMany.mockResolvedValue({ count: 1 });
      prisma.driverActionRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseAction,
        status: 'RESOLVED',
        documentId: 10,
        loadChargeId: 20,
      });

      await service.resolve({
        actionRequestId: 'act-001',
        tenantId: 1,
      });

      expect(prisma.driverActionRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: { not: 'RESOLVED' } },
        data: expect.objectContaining({
          documentId: 10,
          loadChargeId: 20,
        }),
      });
    });
  });

  // ── getByLoad ──

  describe('getByLoad', () => {
    it('returns formatted actions for a load', async () => {
      prisma.driverActionRequest.findMany.mockResolvedValue([
        { ...baseAction },
        { ...baseAction, id: 2, actionRequestId: 'act-002' },
      ]);

      const result = await service.getByLoad(10, 1);
      expect(result).toHaveLength(2);
      expect(result[0].actionRequestId).toBe('act-001');
    });

    it('returns empty array when no actions', async () => {
      prisma.driverActionRequest.findMany.mockResolvedValue([]);
      const result = await service.getByLoad(10, 1);
      expect(result).toEqual([]);
    });
  });

  // ── formatResponse ──

  describe('formatResponse (via getByLoad)', () => {
    it('formats date fields', async () => {
      prisma.driverActionRequest.findMany.mockResolvedValue([
        {
          ...baseAction,
          acknowledgedAt: new Date('2026-04-02T12:00:00Z'),
          resolvedAt: new Date('2026-04-03T14:00:00Z'),
        },
      ]);

      const result = await service.getByLoad(10, 1);
      expect(result[0].acknowledgedAt).toBe('2026-04-02T12:00:00.000Z');
      expect(result[0].resolvedAt).toBe('2026-04-03T14:00:00.000Z');
    });

    it('handles null dates gracefully', async () => {
      prisma.driverActionRequest.findMany.mockResolvedValue([{ ...baseAction }]);

      const result = await service.getByLoad(10, 1);
      expect(result[0].acknowledgedAt).toBeNull();
      expect(result[0].resolvedAt).toBeNull();
    });
  });
});
