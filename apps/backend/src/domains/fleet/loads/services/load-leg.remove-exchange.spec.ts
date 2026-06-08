import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LoadLegService } from './load-leg.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { createMockPrisma } from '../../../../test/mocks/prisma.mock';

describe('LoadLegService — Exchange Removal (DI)', () => {
  let service: LoadLegService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: { del: jest.Mock };
  let events: { emit: jest.Mock };

  const tenantId = 7;
  const loadId = 100;
  // URL param convention (matches createLegsFromExchangePoints): LoadStop.id.
  const loadStopId = 9001;
  // The catalog Stop.id behind the join row.
  const stopId = 500;

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = { del: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadLegService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();

    service = module.get(LoadLegService);
  });

  // ─── shared fixtures ────────────────────────────────────────────────────

  function setupExchangeStop({
    locationType = 'TRUCK_STOP',
    stopTenantId = null as number | null,
    actualPieces = null as number | null,
    actionType = 'exchange',
    loadStatus = 'DRAFT',
    isRelay = true,
    siblingUsageCount = 0,
  } = {}) {
    prisma.loadStop.findFirst.mockResolvedValue({
      id: loadStopId,
      loadId,
      tenantId,
      stopId,
      actionType,
      sequenceOrder: 2,
      actualPieces,
    });
    prisma.stop.findUnique.mockResolvedValue({
      id: stopId,
      name: 'Pilot Travel Center',
      locationType,
      tenantId: stopTenantId,
    });
    prisma.load.findFirst.mockResolvedValue({
      id: loadId,
      loadNumber: 'LD-2026-001',
      status: loadStatus,
      isRelay,
    });
    prisma.loadStop.count.mockResolvedValue(siblingUsageCount);
  }

  // ─── previewExchangeRemoval ─────────────────────────────────────────────

  describe('previewExchangeRemoval', () => {
    it('returns delete + pattern_a_clear for a truck stop with no other usage', async () => {
      setupExchangeStop({ locationType: 'TRUCK_STOP' });

      const result = await service.previewExchangeRemoval(loadId, loadStopId, tenantId);

      expect(result).toEqual({
        resolution: 'delete',
        ambiguous: false,
        stopId: loadStopId, // preview returns LoadStop.id, matching the URL param convention
        stopName: 'Pilot Travel Center',
        reasonCode: 'pattern_a_clear',
      });
    });

    it('returns revert + pattern_b_clear_location_type for a WAREHOUSE', async () => {
      setupExchangeStop({ locationType: 'WAREHOUSE' });

      const result = await service.previewExchangeRemoval(loadId, loadStopId, tenantId);

      expect(result.resolution).toBe('revert');
      expect(result.reasonCode).toBe('pattern_b_clear_location_type');
      expect(result.ambiguous).toBe(false);
    });

    it('returns ambiguous when nothing decisive is available', async () => {
      setupExchangeStop({ locationType: 'OTHER', actualPieces: 0, siblingUsageCount: 0 });

      const result = await service.previewExchangeRemoval(loadId, loadStopId, tenantId);

      expect(result.resolution).toBeNull();
      expect(result.ambiguous).toBe(true);
      expect(result.reasonCode).toBe('ambiguous');
    });

    it('throws NotFoundException when the stop is not on the load', async () => {
      prisma.loadStop.findFirst.mockResolvedValue(null);

      await expect(service.previewExchangeRemoval(loadId, loadStopId, tenantId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the LoadStop is not an exchange', async () => {
      setupExchangeStop({ actionType: 'delivery' });

      await expect(service.previewExchangeRemoval(loadId, loadStopId, tenantId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ─── removeExchangePoint ────────────────────────────────────────────────

  describe('removeExchangePoint', () => {
    function setupRemovalContext({
      remainingStopsAfter,
      remainingRefs = 0,
      siblingUsageCount = 0,
      ...stopOpts
    }: {
      remainingStopsAfter: Array<{ id: number; actionType: string; sequenceOrder: number }>;
      remainingRefs?: number;
      siblingUsageCount?: number;
    } & Omit<Parameters<typeof setupExchangeStop>[0], 'siblingUsageCount'>) {
      setupExchangeStop({ ...stopOpts, siblingUsageCount });
      // No assigned legs by default (so removal isn't blocked).
      prisma.loadLeg.findMany.mockResolvedValue([]);

      // Order of `loadStop.count` calls:
      //   (1) preview path — siblingUsageCount for classification
      //   (2) inside tx, delete path only — remainingRefs check
      // setupExchangeStop already set the first via mockResolvedValue. Override
      // with mockResolvedValueOnce so the second call returns remainingRefs.
      prisma.loadStop.count.mockReset();
      prisma.loadStop.count.mockResolvedValueOnce(siblingUsageCount).mockResolvedValueOnce(remainingRefs);

      prisma.loadStop.delete.mockResolvedValue({ id: 9001 });
      prisma.loadStop.update.mockResolvedValue({ id: 9001 });
      // findMany is called twice in the delete path (resequence + exchange-set
      // recompute) and once in the revert path. Same result for all calls.
      prisma.loadStop.findMany.mockResolvedValue(remainingStopsAfter);
      prisma.stop.delete.mockResolvedValue({ id: stopId });
      prisma.loadLeg.deleteMany.mockResolvedValue({ count: 1 });
      prisma.loadLeg.create.mockImplementation(({ data }: any) => Promise.resolve({ ...data, id: Math.random() }));
      prisma.loadLeg.createMany.mockImplementation(({ data }: any) =>
        Promise.resolve({ count: Array.isArray(data) ? data.length : 1 }),
      );
      prisma.load.update.mockResolvedValue({ id: loadId, isRelay: false });
    }

    it('clear-A: deletes the LoadStop, deletes the Stop when orphaned, demotes off isRelay when last exchange', async () => {
      setupRemovalContext({
        locationType: 'TRUCK_STOP',
        stopTenantId: 7, // tenant-owned → eligible for hard delete
        remainingStopsAfter: [
          { id: 1, actionType: 'pickup', sequenceOrder: 1 },
          { id: 2, actionType: 'delivery', sequenceOrder: 2 },
        ],
        remainingRefs: 0,
      });

      const result = await service.removeExchangePoint(loadId, loadStopId, tenantId);

      expect(result.resolution).toBe('delete');
      expect(result.isRelay).toBe(false);
      expect(result.legCount).toBe(0);
      // LoadStop got deleted
      expect(prisma.loadStop.delete).toHaveBeenCalledWith({ where: { id: 9001 } });
      // Stop got hard-deleted (tenant-owned + no remaining refs)
      expect(prisma.stop.delete).toHaveBeenCalledWith({ where: { id: stopId } });
      // Load was demoted off isRelay
      expect(prisma.load.update).toHaveBeenCalledWith({ where: { id: loadId }, data: { isRelay: false } });
      // No legs recreated
      expect(prisma.loadLeg.create).not.toHaveBeenCalled();
      expect(prisma.loadLeg.createMany).not.toHaveBeenCalled();
      // Cache invalidated and event emitted
      expect(cache.del).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.LOAD_EXCHANGE_REMOVED,
        tenantId,
        expect.objectContaining({
          loadId,
          stopId,
          resolution: 'delete',
          isRelay: false,
          legCount: 0,
        }),
      );
    });

    it('clear-A: does NOT hard-delete the Stop when it is global (tenantId=null)', async () => {
      setupRemovalContext({
        locationType: 'TRUCK_STOP',
        stopTenantId: null, // global catalog row
        remainingStopsAfter: [
          { id: 1, actionType: 'pickup', sequenceOrder: 1 },
          { id: 2, actionType: 'delivery', sequenceOrder: 2 },
        ],
        remainingRefs: 0,
      });

      await service.removeExchangePoint(loadId, loadStopId, tenantId);

      // Stop catalog row is preserved for other tenants
      expect(prisma.stop.delete).not.toHaveBeenCalled();
    });

    it('clear-B: reverts actionType to delivery, keeps the stop and the load as relay if other exchanges remain', async () => {
      setupRemovalContext({
        locationType: 'WAREHOUSE',
        stopTenantId: 7,
        remainingStopsAfter: [
          { id: 1, actionType: 'pickup', sequenceOrder: 1 },
          { id: 9001, actionType: 'delivery', sequenceOrder: 2 }, // reverted
          { id: 3, actionType: 'exchange', sequenceOrder: 3 },
          { id: 4, actionType: 'delivery', sequenceOrder: 4 },
        ],
      });

      const result = await service.removeExchangePoint(loadId, loadStopId, tenantId);

      expect(result.resolution).toBe('revert');
      expect(result.isRelay).toBe(true);
      expect(result.legCount).toBe(2); // exchange splits remaining stops into 2 legs
      expect(prisma.loadStop.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { actionType: 'delivery' } }),
      );
      // No stop catalog deletion
      expect(prisma.stop.delete).not.toHaveBeenCalled();
      // Legs were torn down and rebuilt via createMany (one bulk call, 2 rows)
      expect(prisma.loadLeg.deleteMany).toHaveBeenCalled();
      expect(prisma.loadLeg.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.loadLeg.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ sequence: 1 })]) }),
      );
      const createManyCall = prisma.loadLeg.createMany.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(2);
    });

    it('throws ConflictException when inference is ambiguous and no forced resolution is supplied', async () => {
      setupRemovalContext({
        locationType: 'OTHER',
        stopTenantId: 7,
        remainingStopsAfter: [],
      });

      const err = await service.removeExchangePoint(loadId, loadStopId, tenantId).catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      // The 409 body carries the disambiguator (LoadStop.id, matching the URL param)
      const response = err.getResponse();
      expect(response.ambiguous).toBe(true);
      expect(response.stopId).toBe(loadStopId);
    });

    it('ambiguous + forced resolve=delete proceeds to delete path', async () => {
      setupRemovalContext({
        locationType: 'OTHER',
        stopTenantId: 7,
        remainingStopsAfter: [
          { id: 1, actionType: 'pickup', sequenceOrder: 1 },
          { id: 2, actionType: 'delivery', sequenceOrder: 2 },
        ],
        remainingRefs: 0,
      });

      const result = await service.removeExchangePoint(loadId, loadStopId, tenantId, 'delete');

      expect(result.resolution).toBe('delete');
      expect(prisma.loadStop.delete).toHaveBeenCalled();
    });

    it('ambiguous + forced resolve=revert proceeds to revert path', async () => {
      setupRemovalContext({
        locationType: 'OTHER',
        stopTenantId: 7,
        remainingStopsAfter: [
          { id: 1, actionType: 'pickup', sequenceOrder: 1 },
          { id: 9001, actionType: 'delivery', sequenceOrder: 2 },
        ],
      });

      const result = await service.removeExchangePoint(loadId, loadStopId, tenantId, 'revert');

      expect(result.resolution).toBe('revert');
      expect(prisma.loadStop.update).toHaveBeenCalled();
    });

    it('rejects removal when load is no longer DRAFT or PENDING', async () => {
      setupRemovalContext({
        locationType: 'TRUCK_STOP',
        loadStatus: 'IN_TRANSIT',
        remainingStopsAfter: [],
      });

      await expect(service.removeExchangePoint(loadId, loadStopId, tenantId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects removal when any leg has a driver assigned', async () => {
      setupRemovalContext({
        locationType: 'TRUCK_STOP',
        remainingStopsAfter: [],
      });
      prisma.loadLeg.findMany.mockResolvedValueOnce([{ id: 1, status: 'PENDING', driverId: 42 }]);

      await expect(service.removeExchangePoint(loadId, loadStopId, tenantId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects removal when any leg has advanced past PENDING', async () => {
      setupRemovalContext({
        locationType: 'TRUCK_STOP',
        remainingStopsAfter: [],
      });
      prisma.loadLeg.findMany.mockResolvedValueOnce([{ id: 1, status: 'ASSIGNED', driverId: null }]);

      await expect(service.removeExchangePoint(loadId, loadStopId, tenantId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
