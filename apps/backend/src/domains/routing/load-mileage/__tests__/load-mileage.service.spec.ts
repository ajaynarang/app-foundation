import { Test, TestingModule } from '@nestjs/testing';
import { LoadBillingStatus } from '@prisma/client';
import { getQueueToken } from '@nestjs/bullmq';
import { LoadMileageService } from '../load-mileage.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { MileageService } from '../../../platform-services/mileage/mileage.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { QUEUE_NAMES, GEO_COMPUTE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';

function stop(id: number, lat: number | null, lon: number | null, seq: number) {
  return { id, sequenceOrder: seq, stop: { lat, lon } };
}

const GEOCODED_LOAD = {
  id: 7,
  loadNumber: 'LD-20260516-001',
  tenantId: 3,
  billingStatus: null,
  stops: [stop(101, 32.7767, -96.797, 1), stop(102, 35.1495, -90.049, 2)],
};

describe('LoadMileageService', () => {
  let service: LoadMileageService;
  let prisma: {
    load: { findUnique: jest.Mock; update: jest.Mock };
    loadStop: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let mileage: { getTruckMiles: jest.Mock };
  let events: { emit: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      load: {
        findUnique: jest.fn().mockResolvedValue(GEOCODED_LOAD),
        update: jest.fn().mockResolvedValue({}),
      },
      loadStop: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.resolve(ops)),
    };
    mileage = {
      getTruckMiles: jest.fn().mockResolvedValue({
        origin: '0,0',
        destination: '1,1',
        rated_miles: 482,
        practical_miles: 482,
        shortest_miles: 482,
        duration_hours: 7.75,
        provider: 'here',
      }),
    };
    events = { emit: jest.fn().mockResolvedValue(undefined) };
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadMileageService,
        { provide: PrismaService, useValue: prisma },
        { provide: MileageService, useValue: mileage },
        { provide: DomainEventService, useValue: events },
        { provide: getQueueToken(QUEUE_NAMES.GEO_COMPUTE), useValue: queue },
      ],
    }).compile();

    service = module.get(LoadMileageService);
  });

  describe('enqueueRecalc', () => {
    it('enqueues a debounced, deduped recalc job wrapped in a JobEnvelope', async () => {
      await service.enqueueRecalc(7);

      expect(queue.add).toHaveBeenCalledWith(
        GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC,
        expect.objectContaining({
          tenantId: '3',
          payload: { loadId: 7 },
          metadata: expect.objectContaining({ source: 'api', version: 1 }),
        }),
        expect.objectContaining({
          jobId: expect.stringContaining('7'),
          delay: expect.any(Number),
          attempts: expect.any(Number),
        }),
      );
    });

    it('uses a loadId-scoped jobId so duplicate enqueues collapse', async () => {
      await service.enqueueRecalc(7);
      await service.enqueueRecalc(7);
      const jobIdA = queue.add.mock.calls[0][2].jobId;
      const jobIdB = queue.add.mock.calls[1][2].jobId;
      expect(jobIdA).toBe(jobIdB);
    });

    it('falls back to a synthetic tenantId when the load is missing', async () => {
      prisma.load.findUnique.mockResolvedValueOnce(null);
      await service.enqueueRecalc(999);

      expect(queue.add).toHaveBeenCalledWith(
        GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC,
        expect.objectContaining({ tenantId: '0', payload: { loadId: 999 } }),
        expect.any(Object),
      );
    });
  });

  describe('recompute', () => {
    it('computes total miles + hours and writes Load + LoadStop legs', async () => {
      await service.recompute(7);

      expect(mileage.getTruckMiles).toHaveBeenCalledTimes(1); // 2 stops → 1 leg
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: expect.objectContaining({
            totalMiles: 482,
            estimatedDriveHours: 7.75,
            mileageProvider: 'here',
            mileageCalculatedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.loadStop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 101 },
          data: { legMilesToNext: 482, legDriveHoursToNext: 7.75 },
        }),
      );
    });

    it('emits LOAD_MILEAGE_CALCULATED after a successful write', async () => {
      await service.recompute(7);

      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.LOAD_MILEAGE_CALCULATED,
        3,
        expect.objectContaining({
          loadNumber: 'LD-20260516-001',
          totalMiles: 482,
          estimatedDriveHours: 7.75,
          provider: 'here',
        }),
      );
    });

    it('does nothing when the load does not exist', async () => {
      prisma.load.findUnique.mockResolvedValue(null);
      await service.recompute(999);
      expect(mileage.getTruckMiles).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('skips recompute once an invoice is posted (INVOICED)', async () => {
      prisma.load.findUnique.mockResolvedValue({ ...GEOCODED_LOAD, billingStatus: LoadBillingStatus.INVOICED });
      await service.recompute(7);
      expect(mileage.getTruckMiles).not.toHaveBeenCalled();
      expect(prisma.load.update).not.toHaveBeenCalled();
    });

    it('still computes for a delivered load awaiting documents (PENDING_DOCUMENTS)', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...GEOCODED_LOAD,
        billingStatus: LoadBillingStatus.PENDING_DOCUMENTS,
      });
      await service.recompute(7);
      expect(mileage.getTruckMiles).toHaveBeenCalled();
    });

    it('skips when fewer than 2 stops have coordinates', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...GEOCODED_LOAD,
        stops: [stop(101, 32.7767, -96.797, 1), stop(102, null, null, 2)],
      });
      await service.recompute(7);
      expect(mileage.getTruckMiles).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('bails without writing when a leg computation fails', async () => {
      mileage.getTruckMiles.mockRejectedValue(new Error('HERE 429'));
      await service.recompute(7);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('sums miles across multiple legs', async () => {
      prisma.load.findUnique.mockResolvedValue({
        ...GEOCODED_LOAD,
        stops: [stop(101, 32.0, -96.0, 1), stop(102, 33.0, -95.0, 2), stop(103, 34.0, -94.0, 3)],
      });
      await service.recompute(7);
      expect(mileage.getTruckMiles).toHaveBeenCalledTimes(2); // 3 stops → 2 legs
      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ totalMiles: 964 }) }),
      );
    });
  });
});
