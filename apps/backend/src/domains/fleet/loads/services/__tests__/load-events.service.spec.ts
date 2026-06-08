import { Test, TestingModule } from '@nestjs/testing';
import { LoadEventsService } from '../load-events.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('LoadEventsService', () => {
  let service: LoadEventsService;
  let prisma: { loadEvent: { create: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      loadEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoadEventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LoadEventsService>(LoadEventsService);
  });

  describe('logEvent', () => {
    it('should create a load event record', async () => {
      const params = {
        loadId: 1,
        eventType: 'status_changed',
        fromValue: 'PENDING',
        toValue: 'ASSIGNED',
        description: 'Load assigned to driver',
        userId: 42,
      };

      prisma.loadEvent.create.mockResolvedValue({
        id: 1,
        ...params,
        createdAt: new Date(),
      });

      const result = await service.logEvent(params);

      expect(prisma.loadEvent.create).toHaveBeenCalledWith({
        data: {
          loadId: 1,
          eventType: 'status_changed',
          fromValue: 'PENDING',
          toValue: 'ASSIGNED',
          description: 'Load assigned to driver',
          userId: 42,
          metadata: undefined,
        },
      });
      expect(result.id).toBe(1);
    });

    it('should create event with metadata', async () => {
      const params = {
        loadId: 1,
        eventType: 'created',
        metadata: { source: 'ratecon' },
      };

      prisma.loadEvent.create.mockResolvedValue({
        id: 2,
        ...params,
        createdAt: new Date(),
      });

      await service.logEvent(params);

      expect(prisma.loadEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { source: 'ratecon' },
        }),
      });
    });
  });

  describe('getEvents', () => {
    it('should return events for a load ordered by createdAt desc', async () => {
      const events = [
        { id: 2, eventType: 'status_changed', createdAt: new Date() },
        { id: 1, eventType: 'created', createdAt: new Date() },
      ];
      prisma.loadEvent.findMany.mockResolvedValue(events);

      const result = await service.getEvents(1);

      expect(prisma.loadEvent.findMany).toHaveBeenCalledWith({
        where: { loadId: 1 },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
      expect(result).toEqual(events);
    });

    it('should support pagination', async () => {
      prisma.loadEvent.findMany.mockResolvedValue([]);

      await service.getEvents(1, 10, 20);

      expect(prisma.loadEvent.findMany).toHaveBeenCalledWith({
        where: { loadId: 1 },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 20,
      });
    });
  });
});
