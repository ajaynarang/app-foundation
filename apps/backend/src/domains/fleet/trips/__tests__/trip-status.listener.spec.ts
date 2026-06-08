import { Test, TestingModule } from '@nestjs/testing';
import { TripStatusListener } from '../trip-status.listener';
import { TripService } from '../trip.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

describe('TripStatusListener', () => {
  let listener: TripStatusListener;
  let prisma: any;
  let tripService: any;

  beforeEach(async () => {
    prisma = {
      load: { findFirst: jest.fn() },
    };
    tripService = {
      syncTripStatusFromLoads: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripStatusListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TripService, useValue: tripService },
      ],
    }).compile();

    listener = module.get<TripStatusListener>(TripStatusListener);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleLoadStatusChanged', () => {
    it('syncs trip status when load has a tripId', async () => {
      prisma.load.findFirst.mockResolvedValue({ tripId: 42 });

      const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
        loadNumber: 'LD-10',
        status: 'in_transit',
      });

      await listener.handleLoadStatusChanged(event);

      expect(prisma.load.findFirst).toHaveBeenCalledWith({
        where: { loadNumber: 'LD-10' },
        select: { tripId: true },
      });
      expect(tripService.syncTripStatusFromLoads).toHaveBeenCalledWith(42);
    });

    it('syncs trip status with another loadNumber', async () => {
      prisma.load.findFirst.mockResolvedValue({ tripId: 42 });

      const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
        loadNumber: 'LD-100',
        status: 'delivered',
      });

      await listener.handleLoadStatusChanged(event);

      expect(prisma.load.findFirst).toHaveBeenCalledWith({
        where: { loadNumber: 'LD-100' },
        select: { tripId: true },
      });
      expect(tripService.syncTripStatusFromLoads).toHaveBeenCalledWith(42);
    });

    it('does nothing when load has no tripId', async () => {
      prisma.load.findFirst.mockResolvedValue({ tripId: null });

      const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
        loadNumber: 'LD-10',
        status: 'in_transit',
      });

      await listener.handleLoadStatusChanged(event);

      expect(tripService.syncTripStatusFromLoads).not.toHaveBeenCalled();
    });

    it('does nothing when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
        loadNumber: 'LD-999',
        status: 'in_transit',
      });

      await listener.handleLoadStatusChanged(event);

      expect(tripService.syncTripStatusFromLoads).not.toHaveBeenCalled();
    });

    it('catches and logs errors without rethrowing', async () => {
      prisma.load.findFirst.mockRejectedValue(new Error('DB down'));

      const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
        loadNumber: 'LD-10',
        status: 'in_transit',
      });

      // Should not throw
      await expect(listener.handleLoadStatusChanged(event)).resolves.toBeUndefined();
    });
  });
});
