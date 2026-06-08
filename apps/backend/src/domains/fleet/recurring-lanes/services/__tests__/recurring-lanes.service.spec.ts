import { Test, TestingModule } from '@nestjs/testing';
import { RecurringLanesService } from '../recurring-lanes.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../../infrastructure/database/counter.service';
import { LoadsService } from '../../../loads/services/loads.service';
import { TimezoneService } from '../../../../../shared/services/timezone.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('RecurringLanesService', () => {
  let service: RecurringLanesService;
  let prisma: {
    recurringLane: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    recurringLaneStop: { createMany: jest.Mock };
    fleetOperationsSettings: { findFirst: jest.Mock; findUnique: jest.Mock };
  };
  let counterService: { nextValue: jest.Mock };
  let loadsService: { create: jest.Mock };
  let timezoneService: { resolveTenantTimezone: jest.Mock; localDate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      recurringLane: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      recurringLaneStop: { createMany: jest.fn() },
      fleetOperationsSettings: {
        findFirst: jest.fn().mockResolvedValue({ laneGenerationLookaheadDays: 3 }),
        findUnique: jest.fn().mockResolvedValue({ laneGenerationLookaheadDays: 3 }),
      },
    };

    counterService = { nextValue: jest.fn().mockResolvedValue(1) };
    loadsService = { create: jest.fn() };
    timezoneService = {
      resolveTenantTimezone: jest.fn().mockResolvedValue('UTC'),
      // Default to the server's civil today so existing floor-to-today tests hold.
      localDate: jest.fn().mockImplementation(() => {
        const d = new Date();
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringLanesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterService, useValue: counterService },
        { provide: LoadsService, useValue: loadsService },
        { provide: TimezoneService, useValue: timezoneService },
      ],
    }).compile();

    service = module.get<RecurringLanesService>(RecurringLanesService);
  });

  describe('create', () => {
    it('should create a lane with generated laneId', async () => {
      prisma.recurringLane.create.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        status: 'DRAFT',
      });

      await service.create({
        tenantId: 1,
        name: 'Walmart Weekly',
        customerName: 'Walmart',
        commodityType: 'General',
        weightLbs: 42000,
        scheduleType: 'weekly',
        stops: [
          {
            stopId: 1,
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            earliestArrival: '08:00',
            latestArrival: '10:00',
            dayOffset: 0,
            facilityNotes: 'Use back dock',
          },
        ],
      });

      expect(prisma.recurringLane.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Walmart Weekly',
          status: 'DRAFT',
          tenantId: 1,
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('pause', () => {
    it('should pause an active lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        status: 'PAUSED',
      });

      await service.pause(1, 1);

      expect(prisma.recurringLane.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'PAUSED' },
        include: {
          stops: {
            include: { stop: true },
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      });
    });

    it('should reject pausing a non-active lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'EXPIRED',
        tenantId: 1,
      });

      await expect(service.pause(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('skip', () => {
    it('should set skipNextGeneration flag', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        skipNextGeneration: true,
      });

      await service.skip(1, 1);

      expect(prisma.recurringLane.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { skipNextGeneration: true },
        include: {
          stops: {
            include: { stop: true },
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      });
    });
  });

  describe('computeNextRunDate', () => {
    it('should compute next daily run from a given anchor date', () => {
      const anchor = new Date(2026, 2, 10);
      const result = service.computeNextRunDate('daily', null, anchor);
      expect(result).toEqual(new Date(2026, 2, 11));
    });

    it('should compute next daily run from null (first activation)', () => {
      const result = service.computeNextRunDate('daily', null, null);
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(result).toEqual(tomorrow);
    });

    it('should compute next weekly run from anchor on correct day', () => {
      const anchor = new Date(2026, 2, 9); // Monday
      const result = service.computeNextRunDate('weekly', [1, 4], anchor);
      expect(result).toEqual(new Date(2026, 2, 12)); // Thursday
    });

    it('should wrap to next week when no more days this week', () => {
      const anchor = new Date(2026, 2, 12); // Thursday
      const result = service.computeNextRunDate('weekly', [1, 4], anchor);
      expect(result).toEqual(new Date(2026, 2, 16)); // Next Monday
    });

    it('should compute next biweekly run from anchor', () => {
      const anchor = new Date(2026, 2, 10);
      const result = service.computeNextRunDate('biweekly', null, anchor);
      expect(result).toEqual(new Date(2026, 2, 24));
    });

    it('should compute next monthly run from anchor', () => {
      const anchor = new Date(2026, 2, 15);
      const result = service.computeNextRunDate('monthly', null, anchor);
      expect(result).toEqual(new Date(2026, 3, 15));
    });

    it('should clamp monthly overflow (Jan 31 → Feb 28)', () => {
      const anchor = new Date(2026, 0, 31); // Jan 31
      const result = service.computeNextRunDate('monthly', null, anchor);
      expect(result).toEqual(new Date(2026, 1, 28)); // Feb 28
    });

    it('should clamp monthly overflow (Mar 31 → Apr 30)', () => {
      const anchor = new Date(2026, 2, 31); // Mar 31
      const result = service.computeNextRunDate('monthly', null, anchor);
      expect(result).toEqual(new Date(2026, 3, 30)); // Apr 30
    });

    it('should wrap weekly when anchor day equals the only scheduled day', () => {
      const anchor = new Date(2026, 2, 12); // Thursday (day 4)
      const result = service.computeNextRunDate('weekly', [4], anchor);
      expect(result).toEqual(new Date(2026, 2, 19)); // Next Thursday
    });

    it('should default to +7 days when scheduleDays is empty', () => {
      const anchor = new Date(2026, 2, 10);
      const result = service.computeNextRunDate('weekly', [], anchor);
      expect(result).toEqual(new Date(2026, 2, 17));
    });

    it('should default to +7 days for unknown schedule type', () => {
      const anchor = new Date(2026, 2, 10);
      const result = service.computeNextRunDate('unknown_type' as any, null, anchor);
      expect(result).toEqual(new Date(2026, 2, 17));
    });
  });

  describe('deriveGenerationDate', () => {
    it('should subtract lookahead days from run date', async () => {
      // Use a date far enough in the future so the floor-to-today logic doesn't interfere
      const runDate = new Date(2027, 5, 15);
      const result = await (service as any).deriveGenerationDate(runDate, 1);
      expect(result).toEqual(new Date(2027, 5, 12));
    });

    it('should floor to the tenant-local today if gen date would be in the past', async () => {
      // Tenant local today is 2026-05-29; a runDate just one lookahead-window back
      // from it would floor to that tenant-local midnight (UTC-anchored).
      timezoneService.resolveTenantTimezone.mockResolvedValue('America/Chicago');
      timezoneService.localDate.mockReturnValue('2026-05-29');
      const tenantToday = new Date('2026-05-29T00:00:00.000Z');
      const runDate = new Date('2026-05-30T00:00:00.000Z'); // genDate = runDate - 3d < tenantToday
      const result = await (service as any).deriveGenerationDate(runDate, 1);
      expect(result).toEqual(tenantToday);
    });

    it('should NOT floor when the gen date is still on or after the tenant-local today', async () => {
      timezoneService.resolveTenantTimezone.mockResolvedValue('America/Chicago');
      timezoneService.localDate.mockReturnValue('2026-05-29');
      const runDate = new Date(2027, 5, 15);
      const result = await (service as any).deriveGenerationDate(runDate, 1);
      // genDate (2027-06-12 server-local) is far beyond tenant today, so unchanged.
      expect(result).toEqual(new Date(2027, 5, 12));
    });

    it('should default to 3 days when settings not found', async () => {
      prisma.fleetOperationsSettings.findFirst.mockResolvedValue(null);
      const runDate = new Date(2027, 5, 15);
      const result = await (service as any).deriveGenerationDate(runDate, 1);
      expect(result).toEqual(new Date(2027, 5, 12));
    });
  });

  describe('activate', () => {
    it('should set nextScheduledRunDate and nextGenerationDate', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'DRAFT',
        tenantId: 1,
        scheduleType: 'daily',
        scheduleDays: null,
        stops: [],
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        stops: [],
      });

      await service.activate(1, 1);

      expect(prisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            nextScheduledRunDate: expect.any(Date),
            nextGenerationDate: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('resume', () => {
    it('should keep existing future nextScheduledRunDate', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'PAUSED',
        tenantId: 1,
        scheduleType: 'weekly',
        scheduleDays: [1],
        nextScheduledRunDate: futureDate,
        stops: [],
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        stops: [],
      });

      await service.resume(1, 1);

      const updateCall = prisma.recurringLane.update.mock.calls[0][0];
      expect(updateCall.data.nextScheduledRunDate).toEqual(futureDate);
    });

    it('should recompute if nextScheduledRunDate is in the past', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'PAUSED',
        tenantId: 1,
        scheduleType: 'daily',
        scheduleDays: null,
        nextScheduledRunDate: pastDate,
        stops: [],
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        stops: [],
      });

      await service.resume(1, 1);

      const updateCall = prisma.recurringLane.update.mock.calls[0][0];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(updateCall.data.nextScheduledRunDate.getTime()).toBeGreaterThan(today.getTime());
    });
  });

  describe('expire', () => {
    it('should clear nextGenerationDate and nextScheduledRunDate', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
        stops: [],
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        status: 'EXPIRED',
        stops: [],
      });

      await service.expire(1, 1);

      expect(prisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'EXPIRED',
            nextGenerationDate: null,
            nextScheduledRunDate: null,
          }),
        }),
      );
    });
  });

  describe('generateLoad', () => {
    it('should reject non-active lanes', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'PAUSED',
        tenantId: 1,
        stops: [],
      });

      await expect(service.generateLoad(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should advance nextScheduledRunDate from current value, not today', async () => {
      const currentRunDate = new Date(2026, 2, 15);
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
        scheduleType: 'weekly',
        scheduleDays: [1],
        nextScheduledRunDate: currentRunDate,
        customerName: 'Walmart',
        commodityType: 'General',
        weightLbs: 42000,
        stops: [],
      });
      loadsService.create.mockResolvedValue({
        loadNumber: 1,
      });
      prisma.recurringLane.update.mockResolvedValue({ id: 1, stops: [] });

      await service.generateLoad(1, 1);

      const updateCall = prisma.recurringLane.update.mock.calls[0][0];
      expect(updateCall.data.nextScheduledRunDate).toEqual(new Date(2026, 2, 16));
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt and expire lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        deletedAt: new Date(),
        status: 'EXPIRED',
      });

      const result = await service.softDelete(1, 1);
      expect(result.message).toBe('Lane deleted');
      expect(prisma.recurringLane.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          status: 'EXPIRED',
          nextGenerationDate: null,
          nextScheduledRunDate: null,
        }),
      });
    });

    it('should throw NotFoundException for missing lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue(null);
      await expect(service.softDelete(1, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll', () => {
    const baseLane = {
      id: 1,
      laneId: 'LANE-001',
      name: 'Walmart Weekly',
      customerName: 'Walmart',
      commodityType: 'General',
      weightLbs: 42000,
      status: 'ACTIVE',
      scheduleType: 'weekly',
      autoCreate: false,
      skipNextGeneration: false,
      totalLoadsGenerated: 0,
      tenantId: 1,
      stops: [],
    };

    it('should return paginated lanes with search', async () => {
      prisma.recurringLane.findMany.mockResolvedValue([baseLane]);
      prisma.recurringLane.count.mockResolvedValue(1);

      const result = await service.findAll(1, { search: 'Walmart' });

      expect(prisma.recurringLane.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            deletedAt: null,
            OR: expect.arrayContaining([{ name: { contains: 'Walmart', mode: 'insensitive' } }]),
          }),
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      prisma.recurringLane.findMany.mockResolvedValue([]);
      prisma.recurringLane.count.mockResolvedValue(0);

      await service.findAll(1, { status: 'ACTIVE' });

      expect(prisma.recurringLane.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('should exclude soft-deleted lanes', async () => {
      prisma.recurringLane.findMany.mockResolvedValue([]);
      prisma.recurringLane.count.mockResolvedValue(0);

      await service.findAll(1);

      expect(prisma.recurringLane.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('should apply pagination', async () => {
      prisma.recurringLane.findMany.mockResolvedValue([]);
      prisma.recurringLane.count.mockResolvedValue(0);

      const result = await service.findAll(1, { limit: 10, offset: 20 });

      expect(prisma.recurringLane.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, skip: 20 }));
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
    });
  });

  // ─── findById ────────────────────────────────────────────

  describe('findById', () => {
    it('should return formatted lane when found', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        name: 'Test Lane',
        status: 'ACTIVE',
        tenantId: 1,
        stops: [],
      });

      const result = await service.findById(1, 1);

      expect(result.laneId).toBe('LANE-001');
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue(null);

      await expect(service.findById(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update lane fields', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'DRAFT',
        tenantId: 1,
        stops: [],
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        name: 'Updated Lane',
        status: 'DRAFT',
        stops: [],
      });

      const result = await service.update(1, 1, { name: 'Updated Lane' });

      expect(result.name).toBe('Updated Lane');
    });

    it('should reject updates on expired lanes', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'EXPIRED',
        tenantId: 1,
        stops: [],
      });

      await expect(service.update(1, 1, { name: 'New Name' })).rejects.toThrow(BadRequestException);
    });

    it('should replace stops when stops array is provided', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'DRAFT',
        tenantId: 1,
        stops: [],
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        status: 'DRAFT',
        stops: [],
      });

      await service.update(1, 1, {
        stops: [
          {
            stopId: 10,
            sequenceOrder: 1,
            actionType: 'pickup' as const,
            estimatedDockHours: 2,
            dayOffset: 0,
          },
        ],
      });

      expect(prisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stops: expect.objectContaining({
              deleteMany: {},
              create: expect.any(Array),
            }),
          }),
        }),
      );
    });
  });

  // ─── Lifecycle transitions ───────────────────────────────

  describe('lifecycle transitions', () => {
    it('activate should reject non-draft/paused lanes', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'EXPIRED',
        tenantId: 1,
        stops: [],
      });

      await expect(service.activate(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('resume should reject non-paused lanes', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'ACTIVE',
        tenantId: 1,
        stops: [],
      });

      await expect(service.resume(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('expire should reject already expired lanes', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'EXPIRED',
        tenantId: 1,
        stops: [],
      });

      await expect(service.expire(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('skip should reject non-active lanes', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        status: 'PAUSED',
        tenantId: 1,
        stops: [],
      });

      await expect(service.skip(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── generateLoad ────────────────────────────────────────

  describe('generateLoad (additional)', () => {
    it('should pass intakeSource as recurring_lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        status: 'ACTIVE',
        tenantId: 1,
        scheduleType: 'daily',
        scheduleDays: null,
        nextScheduledRunDate: new Date(),
        customerName: 'Walmart',
        commodityType: 'General',
        weightLbs: 42000,
        stops: [],
      });
      loadsService.create.mockResolvedValue({
        loadNumber: 1,
      });
      prisma.recurringLane.update.mockResolvedValue({ id: 1, stops: [] });

      await service.generateLoad(1, 1);

      expect(loadsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          intakeSource: 'recurring_lane',
          intakeMetadata: expect.objectContaining({
            recurring_lane_id: 1,
            lane_id: 'LANE-001',
          }),
        }),
      );
    });

    it('should increment totalLoadsGenerated after generation', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        status: 'ACTIVE',
        tenantId: 1,
        scheduleType: 'daily',
        scheduleDays: null,
        nextScheduledRunDate: new Date(),
        customerName: 'Walmart',
        commodityType: 'General',
        weightLbs: 42000,
        stops: [],
      });
      loadsService.create.mockResolvedValue({
        loadNumber: 1,
      });
      prisma.recurringLane.update.mockResolvedValue({ id: 1, stops: [] });

      await service.generateLoad(1, 1);

      expect(prisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalLoadsGenerated: { increment: 1 },
            skipNextGeneration: false,
          }),
        }),
      );
    });
  });

  // ─── getUpcoming ─────────────────────────────────────────

  describe('getUpcoming', () => {
    it('should return active lanes within lookahead window', async () => {
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        laneGenerationLookaheadDays: 3,
      });
      prisma.recurringLane.findMany.mockResolvedValue([]);

      const result = await service.getUpcoming(1);

      expect(result.lookaheadDays).toBe(3);
      expect(prisma.recurringLane.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            status: 'ACTIVE',
            deletedAt: null,
          }),
        }),
      );
    });

    it('should default lookahead to 3 days when no settings', async () => {
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      prisma.recurringLane.findMany.mockResolvedValue([]);

      const result = await service.getUpcoming(1);

      expect(result.lookaheadDays).toBe(3);
    });
  });

  // ─── preview ─────────────────────────────────────────────

  describe('preview', () => {
    it('should return lane data for preview', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        name: 'Test Lane',
        customerName: 'ACME',
        commodityType: 'General',
        weightLbs: 42000,
        requiredEquipmentType: 'DRY_VAN',
        rateCents: 250000,
        pieces: 10,
        specialRequirements: null,
        referenceNumber: 'REF-001',
        autoAssignDriverId: null,
        autoAssignVehicleId: null,
        nextGenerationDate: new Date(),
        tenantId: 1,
        stops: [
          {
            stopId: 1,
            sequenceOrder: 1,
            actionType: 'pickup',
            earliestArrival: null,
            latestArrival: null,
            estimatedDockHours: 2,
            dayOffset: 0,
            stop: { name: 'Dallas DC', city: 'Dallas', state: 'TX' },
          },
        ],
      });

      const result = await service.preview(1, 1);

      expect(result.laneId).toBe('LANE-001');
      expect(result.stops).toHaveLength(1);
      expect(result.stops[0].stopName).toBe('Dallas DC');
    });
  });

  // ─── update ─────────────────────────────────────────────

  describe('update', () => {
    it('should update scalar fields on an active lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        tenantId: 1,
        status: 'ACTIVE',
        effectiveUntil: null,
      });
      prisma.recurringLane.update.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        customerName: 'Updated Corp',
        rateCents: 500000,
      });

      await service.update(1, 1, {
        customerName: 'Updated Corp',
        rateCents: 500000,
        requiredEquipmentType: 'reefer',
        commodityType: 'frozen',
        weightLbs: 42000,
        pieces: 15,
        specialRequirements: 'Temp controlled',
        referenceNumber: 'REF-UPD',
        scheduleType: 'daily',
        scheduleDays: [1, 2, 3, 4, 5],
        autoCreate: true,
        autoAssignDriverId: 5,
        autoAssignVehicleId: 3,
        effectiveFrom: '2026-04-01',
        effectiveUntil: '2026-12-31',
      });

      expect(prisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerName: 'Updated Corp',
            rateCents: 500000,
            scheduleType: 'daily',
          }),
        }),
      );
    });

    it('should throw NotFoundException when lane not found', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue(null);

      await expect(service.update(1, 1, { customerName: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for expired lane', async () => {
      prisma.recurringLane.findFirst.mockResolvedValue({
        id: 1,
        laneId: 'LANE-001',
        tenantId: 1,
        status: 'EXPIRED',
        effectiveUntil: new Date('2020-01-01'),
      });

      await expect(service.update(1, 1, { customerName: 'X' })).rejects.toThrow(BadRequestException);
    });
  });
});
