import { Test, TestingModule } from '@nestjs/testing';
import { DriverTimelineService } from '../driver-timeline.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';

describe('DriverTimelineService', () => {
  let service: DriverTimelineService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const mockActiveLoad = {
    loadNumber: 'LD-001',
    referenceNumber: 'REF-001',
    status: 'IN_TRANSIT',
    originCity: 'Dallas',
    originState: 'TX',
    destinationCity: 'Atlanta',
    destinationState: 'GA',
    customerName: 'ACME Corp',
    stops: [
      {
        status: 'COMPLETED',
        appointmentDate: new Date(),
        stop: { name: 'Dallas DC', city: 'Dallas', state: 'TX' },
      },
      {
        status: 'PENDING',
        appointmentDate: new Date('2026-04-05'),
        stop: { name: 'Atlanta Warehouse', city: 'Atlanta', state: 'GA' },
      },
    ],
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    // Prisma `findMany` always returns an array — default the mock so the
    // timeline's message queries don't see `undefined`. Tests override as needed.
    prisma.conversationMessage.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [DriverTimelineService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DriverTimelineService>(DriverTimelineService);
  });

  describe('getTimeline', () => {
    it('should return empty entries when no active load and no data', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.alert.findMany.mockResolvedValue([]);

      const result = await service.getTimeline(1, 100);

      expect(result.entries).toEqual([]);
      expect(result.loadContext).toBeNull();
      expect(result.cursor).toBeNull();
    });

    it('should build loadContext from active load', async () => {
      prisma.load.findFirst.mockResolvedValue(mockActiveLoad);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.alert.findMany.mockResolvedValue([]);

      const result = await service.getTimeline(1, 100);

      expect(result.loadContext).not.toBeNull();
      expect(result.loadContext.status).toBe('IN_TRANSIT');
      expect(result.loadContext.origin).toBe('Dallas, TX');
      expect(result.loadContext.destination).toBe('Atlanta, GA');
      expect(result.loadContext.currentStop).toBeDefined();
      expect(result.loadContext.currentStop.name).toBe('Atlanta Warehouse');
    });

    it('should resolve load by loadId when provided', async () => {
      prisma.load.findFirst.mockResolvedValue(mockActiveLoad);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getTimeline(1, 100, 'LD-001');

      expect(prisma.load.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loadNumber: 'LD-001', tenantId: 1 },
        }),
      );
    });

    it('should resolve active load by driver when no loadId', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.alert.findMany.mockResolvedValue([]);

      await service.getTimeline(1, 42);

      expect(prisma.load.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driverId: 42,
            status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          }),
        }),
      );
    });

    it('should merge and sort dispatch, sally, and alert entries chronologically', async () => {
      prisma.load.findFirst.mockResolvedValue(mockActiveLoad);

      // Dispatch conversation
      const dispatchConv = { id: 10 };
      const sallyConv = { id: 20 };
      prisma.conversation.findUnique.mockResolvedValueOnce(dispatchConv).mockResolvedValueOnce(sallyConv);

      prisma.conversationMessage.findMany
        .mockResolvedValueOnce([
          {
            messageId: 'msg-1',
            role: 'dispatcher',
            content: 'Head to Atlanta',
            createdAt: new Date('2026-04-02T10:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            messageId: 'msg-2',
            role: 'user',
            content: 'Route question',
            createdAt: new Date('2026-04-02T09:00:00Z'),
            card: null,
            speakText: null,
          },
        ]);

      prisma.alert.findMany.mockResolvedValue([
        {
          alertId: 'alert-1',
          title: 'Speeding Warning',
          priority: 'HIGH',
          category: 'safety',
          createdAt: new Date('2026-04-02T11:00:00Z'),
          acknowledgedAt: null,
          recommendedAction: 'Reduce speed',
        },
      ]);

      const result = await service.getTimeline(1, 100);

      expect(result.entries).toHaveLength(3);
      // Sorted oldest first
      expect(result.entries[0].id).toBe('msg-2'); // 09:00
      expect(result.entries[1].id).toBe('msg-1'); // 10:00
      expect(result.entries[2].id).toBe('alert-1'); // 11:00
    });

    it('should trim to limit and set cursor', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue(null);

      // Generate many alerts
      const alerts = Array.from({ length: 5 }, (_, i) => ({
        alertId: `alert-${i}`,
        title: `Alert ${i}`,
        priority: 'LOW',
        category: 'info',
        createdAt: new Date(`2026-04-02T${String(i + 10).padStart(2, '0')}:00:00Z`),
        acknowledgedAt: null,
        recommendedAction: null,
      }));
      prisma.alert.findMany.mockResolvedValue(alerts);

      const result = await service.getTimeline(1, 100, undefined, undefined, 3);

      // Should trim to last 3 entries
      expect(result.entries).toHaveLength(3);
      expect(result.cursor).toBeDefined();
    });

    it('should use cursor for pagination', async () => {
      prisma.load.findFirst.mockResolvedValue(mockActiveLoad);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.alert.findMany.mockResolvedValue([]);

      const cursor = '2026-04-01T12:00:00.000Z';
      await service.getTimeline(1, 100, undefined, cursor);

      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lt: new Date(cursor) },
          }),
        }),
      );
    });

    it('should map alert entries with correct type and metadata', async () => {
      prisma.load.findFirst.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue(null);
      prisma.alert.findMany.mockResolvedValue([
        {
          alertId: 'alert-1',
          title: 'HOS Violation',
          priority: 'CRITICAL',
          category: 'compliance',
          createdAt: new Date('2026-04-02T10:00:00Z'),
          acknowledgedAt: new Date('2026-04-02T10:05:00Z'),
          recommendedAction: 'Take break',
        },
      ]);

      const result = await service.getTimeline(1, 100);

      expect(result.entries[0].type).toBe('alert');
      expect(result.entries[0].content).toBe('HOS Violation');
      expect(result.entries[0].metadata?.severity).toBe('CRITICAL');
      expect(result.entries[0].metadata?.acknowledgedAt).toBeDefined();
    });
  });
});
