// Mock ESM module before imports
jest.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid-id',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MoneyCodeService } from '../money-code.service';
import { LoadChargesService } from '../load-charges.service';
import { AlertTriggersService } from '../../../../operations/alerts/services/alert-triggers.service';
import { PushService } from '../../../../../infrastructure/push/push.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('MoneyCodeService', () => {
  let service: MoneyCodeService;
  let prisma: any;
  let loadChargesService: any;
  let alertTriggers: any;
  let pushService: any;

  const baseMc = {
    id: 1,
    moneyCodeId: 'mc-001',
    tenantId: 1,
    loadId: 10,
    stopId: null,
    driverId: 5,
    code: null,
    amountCents: 30000,
    requestedCents: 30000,
    method: 'COMCHEK',
    status: 'REQUESTED',
    requestedAt: new Date('2026-04-01'),
    approvedAt: null,
    usedAt: null,
    expiresAt: null,
    driverNote: null,
    dispatcherNote: null,
    receiptDocumentId: null,
    loadChargeId: null,
    createdAt: new Date('2026-04-01'),
  };

  beforeEach(async () => {
    prisma = {
      moneyCode: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      driver: { findUnique: jest.fn() },
      load: { findUnique: jest.fn() },
      loadCharge: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        return fn;
      }),
    };

    loadChargesService = { addCharge: jest.fn() };
    alertTriggers = { trigger: jest.fn() };
    pushService = { sendPushToUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoneyCodeService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoadChargesService, useValue: loadChargesService },
        { provide: AlertTriggersService, useValue: alertTriggers },
        { provide: PushService, useValue: pushService },
      ],
    }).compile();

    service = module.get<MoneyCodeService>(MoneyCodeService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ──

  describe('create', () => {
    it('creates a money code and fires LUMPER_REQUEST alert', async () => {
      prisma.moneyCode.create.mockResolvedValue({ ...baseMc });
      prisma.driver.findUnique.mockResolvedValue({
        driverId: 'DRV-1',
        name: 'John',
      });
      prisma.load.findUnique.mockResolvedValue({ loadNumber: 'LD-100' });

      const result = await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        requestedCents: 30000,
        method: 'COMCHEK',
      });

      expect(prisma.moneyCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          loadId: 10,
          driverId: 5,
          amountCents: 30000,
          status: 'REQUESTED',
          method: 'COMCHEK',
        }),
      });
      expect(alertTriggers.trigger).toHaveBeenCalledWith(
        'LUMPER_REQUEST',
        1,
        'DRV-1',
        expect.objectContaining({ requestedCents: 30000 }),
      );
      expect(result.moneyCodeId).toBe('mc-001');
    });

    it('skips alert when driver or load not found', async () => {
      prisma.moneyCode.create.mockResolvedValue({ ...baseMc });
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.load.findUnique.mockResolvedValue(null);

      await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        requestedCents: 30000,
        method: 'COMCHEK',
      });

      expect(alertTriggers.trigger).not.toHaveBeenCalled();
    });

    it('passes optional stopId and driverNote', async () => {
      prisma.moneyCode.create.mockResolvedValue({
        ...baseMc,
        stopId: 3,
        driverNote: 'Need lumper',
      });
      prisma.driver.findUnique.mockResolvedValue(null);
      prisma.load.findUnique.mockResolvedValue(null);

      const result = await service.create({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        stopId: 3,
        requestedCents: 30000,
        method: 'COMCHEK',
        driverNote: 'Need lumper',
      });

      expect(prisma.moneyCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stopId: 3,
          driverNote: 'Need lumper',
        }),
      });
      expect(result.stopId).toBe(3);
    });
  });

  // ── approve ──

  describe('approve', () => {
    it('transitions from requested to approved and sends push', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });
      const approved = {
        ...baseMc,
        status: 'APPROVED',
        code: '1234',
        amountCents: 30000,
      };
      prisma.moneyCode.findUniqueOrThrow.mockResolvedValue(approved);
      prisma.driver.findUnique.mockResolvedValue({
        user: { id: 99 },
      });

      const result = await service.approve({
        moneyCodeId: 'mc-001',
        tenantId: 1,
        approvedBy: 2,
        code: '1234',
        amountCents: 30000,
      });

      expect(prisma.moneyCode.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: 'REQUESTED' },
        data: expect.objectContaining({ status: 'APPROVED', code: '1234' }),
      });
      expect(pushService.sendPushToUser).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          title: expect.stringContaining('Lumper Approved'),
        }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('throws NotFoundException when money code not found', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue(null);

      await expect(
        service.approve({
          moneyCodeId: 'bad',
          tenantId: 1,
          approvedBy: 2,
          code: '1234',
          amountCents: 30000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when tenantId does not match', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({
        ...baseMc,
        tenantId: 999,
      });

      await expect(
        service.approve({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          approvedBy: 2,
          code: '1234',
          amountCents: 30000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid transition', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({
        ...baseMc,
        status: 'DENIED',
      });

      await expect(
        service.approve({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          approvedBy: 2,
          code: '1234',
          amountCents: 30000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if atomic transition loses race', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          approvedBy: 2,
          code: '1234',
          amountCents: 30000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('skips push notification when driver has no user', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.moneyCode.findUniqueOrThrow.mockResolvedValue({
        ...baseMc,
        status: 'APPROVED',
      });
      prisma.driver.findUnique.mockResolvedValue({ user: null });

      await service.approve({
        moneyCodeId: 'mc-001',
        tenantId: 1,
        approvedBy: 2,
        code: '1234',
        amountCents: 30000,
      });

      expect(pushService.sendPushToUser).not.toHaveBeenCalled();
    });

    it('uses custom expiresInHours', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.moneyCode.findUniqueOrThrow.mockResolvedValue({
        ...baseMc,
        status: 'APPROVED',
      });
      prisma.driver.findUnique.mockResolvedValue(null);

      await service.approve({
        moneyCodeId: 'mc-001',
        tenantId: 1,
        approvedBy: 2,
        code: '1234',
        amountCents: 30000,
        expiresInHours: 48,
      });

      const callData = prisma.moneyCode.updateMany.mock.calls[0][0].data;
      expect(callData.expiresAt).toBeInstanceOf(Date);
    });
  });

  // ── deny ──

  describe('deny', () => {
    it('transitions from requested to denied and sends push', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.moneyCode.findUniqueOrThrow.mockResolvedValue({
        ...baseMc,
        status: 'DENIED',
      });
      prisma.driver.findUnique.mockResolvedValue({
        user: { id: 99 },
      });

      const result = await service.deny({
        moneyCodeId: 'mc-001',
        tenantId: 1,
        deniedBy: 2,
        dispatcherNote: 'Not approved',
      });

      expect(result.status).toBe('DENIED');
      expect(pushService.sendPushToUser).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          title: 'Lumper Request Denied',
        }),
      );
    });

    it('throws for invalid transition from used', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({
        ...baseMc,
        status: 'USED',
      });

      await expect(
        service.deny({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          deniedBy: 2,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses default body when no dispatcherNote', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });
      prisma.moneyCode.findUniqueOrThrow.mockResolvedValue({
        ...baseMc,
        status: 'DENIED',
      });
      prisma.driver.findUnique.mockResolvedValue({
        user: { id: 99 },
      });

      await service.deny({
        moneyCodeId: 'mc-001',
        tenantId: 1,
        deniedBy: 2,
      });

      expect(pushService.sendPushToUser).toHaveBeenCalledWith(
        99,
        expect.objectContaining({
          body: 'Your lumper request was denied',
        }),
      );
    });
  });

  // ── markUsed ──

  describe('markUsed', () => {
    it('creates a load charge and updates status to used', async () => {
      const approvedMc = {
        ...baseMc,
        status: 'APPROVED',
        code: '1234',
        method: 'COMCHEK',
      };
      prisma.moneyCode.findUnique.mockResolvedValue(approvedMc);
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });
      loadChargesService.addCharge.mockResolvedValue({ id: 50 });
      prisma.moneyCode.update.mockResolvedValue({
        ...approvedMc,
        status: 'USED',
        loadChargeId: 50,
      });
      prisma.moneyCode.findUniqueOrThrow.mockResolvedValue({
        ...approvedMc,
        status: 'USED',
        loadChargeId: 50,
      });

      const result = await service.markUsed({
        moneyCodeId: 'mc-001',
        tenantId: 1,
        actualAmountCents: 28000,
      });

      expect(loadChargesService.addCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          loadId: 10,
          chargeType: 'lumper',
          unitPriceCents: 28000,
        }),
      );
      expect(prisma.moneyCode.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: 'APPROVED' },
        data: expect.objectContaining({ status: 'USED' }),
      });
      expect(result.status).toBe('USED');
    });

    it('throws for invalid transition from requested', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({
        ...baseMc,
        status: 'REQUESTED',
      });

      await expect(
        service.markUsed({
          moneyCodeId: 'mc-001',
          tenantId: 1,
          actualAmountCents: 28000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── cancel ──

  describe('cancel', () => {
    it('cancels a requested money code', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      prisma.moneyCode.update.mockResolvedValue({
        ...baseMc,
        status: 'CANCELLED',
      });

      const result = await service.cancel('mc-001', 1);
      expect(result.status).toBe('CANCELLED');
    });

    it('cancels an approved money code', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({
        ...baseMc,
        status: 'APPROVED',
      });
      prisma.moneyCode.update.mockResolvedValue({
        ...baseMc,
        status: 'CANCELLED',
      });

      const result = await service.cancel('mc-001', 1);
      expect(result.status).toBe('CANCELLED');
    });

    it('throws for terminal status (used)', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({
        ...baseMc,
        status: 'USED',
      });

      await expect(service.cancel('mc-001', 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ── getByLoad ──

  describe('getByLoad', () => {
    it('returns formatted money codes for a load', async () => {
      prisma.moneyCode.findMany.mockResolvedValue([{ ...baseMc }, { ...baseMc, id: 2, moneyCodeId: 'mc-002' }]);

      const result = await service.getByLoad(10, 1);
      expect(result).toHaveLength(2);
      expect(result[0].moneyCodeId).toBe('mc-001');
    });

    it('expires approved codes past expiresAt on read', async () => {
      const pastExpiry = new Date('2020-01-01');
      prisma.moneyCode.findMany.mockResolvedValue([{ ...baseMc, status: 'APPROVED', expiresAt: pastExpiry, id: 1 }]);
      prisma.moneyCode.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.getByLoad(10, 1);

      expect(prisma.moneyCode.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1] }, status: 'APPROVED' },
        data: { status: 'EXPIRED' },
      });
      expect(result[0].status).toBe('EXPIRED');
    });

    it('does not expire codes that are not yet past expiresAt', async () => {
      const futureExpiry = new Date('2099-01-01');
      prisma.moneyCode.findMany.mockResolvedValue([{ ...baseMc, status: 'APPROVED', expiresAt: futureExpiry }]);

      await service.getByLoad(10, 1);
      expect(prisma.moneyCode.updateMany).not.toHaveBeenCalled();
    });

    it('does not expire codes with non-approved status', async () => {
      const pastExpiry = new Date('2020-01-01');
      prisma.moneyCode.findMany.mockResolvedValue([{ ...baseMc, status: 'REQUESTED', expiresAt: pastExpiry }]);

      await service.getByLoad(10, 1);
      expect(prisma.moneyCode.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── getById ──

  describe('getById', () => {
    it('returns formatted money code', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue({ ...baseMc });
      const result = await service.getById('mc-001', 1);
      expect(result.moneyCodeId).toBe('mc-001');
    });

    it('throws NotFoundException for missing code', async () => {
      prisma.moneyCode.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ── issueProactively ──

  describe('issueProactively', () => {
    it('creates a pre-approved money code and sends push', async () => {
      const issued = {
        ...baseMc,
        status: 'APPROVED',
        code: 'CODE-99',
        amountCents: 25000,
      };
      prisma.moneyCode.create.mockResolvedValue(issued);
      prisma.driver.findUnique.mockResolvedValue({
        user: { id: 88 },
      });

      const result = await service.issueProactively({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        code: 'CODE-99',
        amountCents: 25000,
        method: 'COMCHEK',
        issuedBy: 2,
      });

      expect(prisma.moneyCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'APPROVED',
          code: 'CODE-99',
          amountCents: 25000,
        }),
      });
      expect(pushService.sendPushToUser).toHaveBeenCalledWith(
        88,
        expect.objectContaining({
          title: expect.stringContaining('Lumper Code Issued'),
        }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('skips push when driver has no user', async () => {
      prisma.moneyCode.create.mockResolvedValue({
        ...baseMc,
        status: 'APPROVED',
      });
      prisma.driver.findUnique.mockResolvedValue(null);

      await service.issueProactively({
        tenantId: 1,
        loadId: 10,
        driverId: 5,
        code: 'CODE-99',
        amountCents: 25000,
        method: 'COMCHEK',
        issuedBy: 2,
      });

      expect(pushService.sendPushToUser).not.toHaveBeenCalled();
    });
  });

  // ── getLumperInsights ──

  describe('getLumperInsights', () => {
    it('returns facility avg and driver history when available', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 10,
        driverId: 5,
        stops: [{ stop: { name: 'Walmart DC', city: 'Bentonville', state: 'AR' } }],
      });
      prisma.loadCharge.findMany.mockResolvedValue([{ totalCents: 20000 }, { totalCents: 30000 }]);
      prisma.moneyCode.findMany.mockResolvedValue([{ requestedCents: 25000, amountCents: 25000 }]);

      const result = await service.getLumperInsights(10, 1);

      expect(result.facilityAvg).toEqual({ avg: 25000, count: 2 });
      expect(result.driverHistory).toEqual({ count: 1, allMatched: true });
      expect(result.facilityName).toBe('Walmart DC');
    });

    it('returns null facilityAvg when no charges exist', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 10,
        driverId: 5,
        stops: [{ stop: { name: 'Walmart DC', city: 'X', state: 'Y' } }],
      });
      prisma.loadCharge.findMany.mockResolvedValue([]);
      prisma.moneyCode.findMany.mockResolvedValue([]);

      const result = await service.getLumperInsights(10, 1);
      expect(result.facilityAvg).toBeNull();
      expect(result.driverHistory).toBeNull();
    });

    it('returns null facilityName when no delivery stops', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 10,
        driverId: null,
        stops: [],
      });

      const result = await service.getLumperInsights(10, 1);
      expect(result.facilityName).toBeNull();
      expect(result.facilityAvg).toBeNull();
      expect(result.driverHistory).toBeNull();
    });

    it('throws NotFoundException when load not found', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await expect(service.getLumperInsights(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('sets allMatched=false when amounts differ', async () => {
      prisma.load.findUnique.mockResolvedValue({
        id: 10,
        driverId: 5,
        stops: [],
      });
      prisma.moneyCode.findMany.mockResolvedValue([{ requestedCents: 30000, amountCents: 25000 }]);

      const result = await service.getLumperInsights(10, 1);
      expect(result.driverHistory).toEqual({ count: 1, allMatched: false });
    });
  });

  // ── formatResponse ──

  describe('formatResponse (via getById)', () => {
    it('formats dates with toISOString', async () => {
      const mc = {
        ...baseMc,
        requestedAt: new Date('2026-04-01T10:00:00Z'),
        createdAt: new Date('2026-04-01T10:00:00Z'),
      };
      prisma.moneyCode.findUnique.mockResolvedValue(mc);

      const result = await service.getById('mc-001', 1);
      expect(result.requestedAt).toBe('2026-04-01T10:00:00.000Z');
      expect(result.createdAt).toBe('2026-04-01T10:00:00.000Z');
    });

    it('handles null date fields', async () => {
      const mc = {
        ...baseMc,
        approvedAt: null,
        usedAt: null,
        expiresAt: null,
      };
      prisma.moneyCode.findUnique.mockResolvedValue(mc);

      const result = await service.getById('mc-001', 1);
      expect(result.approvedAt).toBeNull();
      expect(result.usedAt).toBeNull();
      expect(result.expiresAt).toBeNull();
    });
  });
});
