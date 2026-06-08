import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SavedSearchJobHandler } from '../saved-search.processor';
import { SavedSearchService } from '../saved-search.service';
import { VendorCircuitBreakerService } from '../../../../../infrastructure/queue/vendor-circuit-breaker.service';
import { VENDOR_DATA_JOB_NAMES } from '../../../../../infrastructure/queue/queue.constants';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';

// Mock LoadBoardService to avoid Mastra ESM import chain
jest.mock('../../load-board.service', () => ({
  LoadBoardService: jest.fn().mockImplementation(() => ({
    search: jest.fn(),
  })),
}));
import { LoadBoardService } from '../../load-board.service';

describe('SavedSearchJobHandler', () => {
  let processor: SavedSearchJobHandler;
  let savedSearchService: any;
  let loadBoardService: any;
  let eventEmitter: any;
  let circuitBreaker: any;

  beforeEach(async () => {
    savedSearchService = {
      findAllActive: jest.fn(),
      updatePolled: jest.fn(),
    };

    loadBoardService = {
      search: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    circuitBreaker = {
      isOpen: jest.fn().mockResolvedValue(false),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedSearchJobHandler,
        { provide: SavedSearchService, useValue: savedSearchService },
        { provide: LoadBoardService, useValue: loadBoardService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: VendorCircuitBreakerService, useValue: circuitBreaker },
      ],
    }).compile();

    processor = module.get<SavedSearchJobHandler>(SavedSearchJobHandler);
  });

  const pollJob = (overrides: Partial<{ name: string }> = {}) =>
    ({ name: VENDOR_DATA_JOB_NAMES.LOAD_BOARD_POLL, ...overrides }) as any;

  describe('process', () => {
    it('should throw when circuit breaker is open', async () => {
      circuitBreaker.isOpen.mockResolvedValue(true);

      await expect(processor.run(pollJob())).rejects.toThrow(/circuit open/i);
    });

    it('should record success on clean sweep', async () => {
      savedSearchService.findAllActive.mockResolvedValue([]);

      await processor.run(pollJob());

      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('dat');
    });

    it('should record failure and re-throw on top-level failure', async () => {
      savedSearchService.findAllActive.mockRejectedValue(new Error('redis down'));

      await expect(processor.run(pollJob())).rejects.toThrow('redis down');

      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith('dat');
    });

    it('should do nothing when no active searches', async () => {
      savedSearchService.findAllActive.mockResolvedValue([]);

      await processor.run(pollJob());

      expect(loadBoardService.search).not.toHaveBeenCalled();
    });

    it('should poll each active search and notify on new listings', async () => {
      savedSearchService.findAllActive.mockResolvedValue([
        {
          id: 1,
          savedSearchId: 'ss-1',
          tenantId: 1,
          name: 'Dallas loads',
          searchParams: { origin: { city: 'Dallas', state: 'TX' } },
          minRate: null,
          lastSeenIds: [],
          user: { userId: 'u-1' },
        },
      ]);

      loadBoardService.search.mockResolvedValue({
        listings: [
          {
            externalId: 'load-1',
            origin: { city: 'Dallas', state: 'TX' },
            destination: { city: 'Houston', state: 'TX' },
            rate: 2500,
            ratePerMile: 2.5,
          },
        ],
      });

      await processor.run(pollJob());

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED,
        expect.objectContaining({
          event: SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED,
          tenantId: '1',
          data: expect.objectContaining({
            savedSearchId: 'ss-1',
            newCount: 1,
            recipientUserIds: ['u-1'],
          }),
        }),
      );
      expect(savedSearchService.updatePolled).toHaveBeenCalledWith(1, 1, ['load-1']);
    });

    it('should not notify when no new listings (all seen before)', async () => {
      savedSearchService.findAllActive.mockResolvedValue([
        {
          id: 1,
          savedSearchId: 'ss-1',
          tenantId: 1,
          name: 'Test',
          searchParams: {},
          minRate: null,
          lastSeenIds: ['load-1'],
          user: { userId: 'u-1' },
        },
      ]);

      loadBoardService.search.mockResolvedValue({
        listings: [
          {
            externalId: 'load-1',
            origin: { city: 'A', state: 'TX' },
            destination: { city: 'B', state: 'TX' },
            rate: 2000,
            ratePerMile: 2.0,
          },
        ],
      });

      await processor.run(pollJob());

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should filter by minRate when set', async () => {
      savedSearchService.findAllActive.mockResolvedValue([
        {
          id: 1,
          savedSearchId: 'ss-1',
          tenantId: 1,
          name: 'High rate',
          searchParams: {},
          minRate: 3.0,
          lastSeenIds: [],
          user: { userId: 'u-1' },
        },
      ]);

      loadBoardService.search.mockResolvedValue({
        listings: [
          {
            externalId: 'load-1',
            ratePerMile: 2.0, // below minRate
            origin: { city: 'A', state: 'TX' },
            destination: { city: 'B', state: 'TX' },
            rate: 1000,
          },
          {
            externalId: 'load-2',
            ratePerMile: 3.5, // above minRate
            origin: { city: 'C', state: 'TX' },
            destination: { city: 'D', state: 'TX' },
            rate: 3500,
          },
        ],
      });

      await processor.run(pollJob());

      // Only load-2 passes the filter
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED,
        expect.objectContaining({
          data: expect.objectContaining({ newCount: 1, recipientUserIds: ['u-1'] }),
        }),
      );
    });

    it('should handle NotFoundException gracefully (DAT disconnected)', async () => {
      savedSearchService.findAllActive.mockResolvedValue([
        {
          id: 1,
          savedSearchId: 'ss-1',
          tenantId: 1,
          name: 'Test',
          searchParams: {},
          minRate: null,
          lastSeenIds: [],
          user: { userId: 'u-1' },
        },
      ]);

      loadBoardService.search.mockRejectedValue(new NotFoundException('DAT not connected'));

      // Should not throw at the process() level — inner per-search NotFoundException
      // is swallowed and the sweep completes; recordSuccess fires.
      await expect(processor.run(pollJob())).resolves.toBeUndefined();
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('dat');
    });

    it('should continue processing other searches when one fails', async () => {
      savedSearchService.findAllActive.mockResolvedValue([
        {
          id: 1,
          savedSearchId: 'ss-1',
          tenantId: 1,
          name: 'Fail',
          searchParams: {},
          minRate: null,
          lastSeenIds: [],
          user: { userId: 'u-1' },
        },
        {
          id: 2,
          savedSearchId: 'ss-2',
          tenantId: 1,
          name: 'Success',
          searchParams: {},
          minRate: null,
          lastSeenIds: [],
          user: { userId: 'u-2' },
        },
      ]);

      loadBoardService.search.mockRejectedValueOnce(new Error('API Error')).mockResolvedValueOnce({ listings: [] });

      await processor.run(pollJob());

      // Second search should still be polled
      expect(savedSearchService.updatePolled).toHaveBeenCalledWith(2, 0, []);
    });
  });
});
