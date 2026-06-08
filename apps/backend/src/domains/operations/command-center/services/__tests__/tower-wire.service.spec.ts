import { Test, TestingModule } from '@nestjs/testing';
import { AlertPriority, LoadStatus } from '@prisma/client';
import { DomainEvent } from '../../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { TOWER_DESK_RESPONSIBILITY_ALLOW_LIST, TowerWireService } from '../tower-wire.service';

describe('TowerWireService', () => {
  let service: TowerWireService;

  const mockCache = {
    getOrSet: jest.fn().mockImplementation((_k: string, fn: () => any) => fn()),
  };

  const mockPrisma = {
    alert: { findMany: jest.fn().mockResolvedValue([]) },
    conversationMessage: { findMany: jest.fn().mockResolvedValue([]) },
    deskEpisode: { findMany: jest.fn().mockResolvedValue([]) },
    loadEvent: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.getOrSet.mockImplementation((_k: string, fn: () => any) => fn());
    mockPrisma.alert.findMany.mockResolvedValue([]);
    mockPrisma.conversationMessage.findMany.mockResolvedValue([]);
    mockPrisma.deskEpisode.findMany.mockResolvedValue([]);
    mockPrisma.loadEvent.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TowerWireService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get(TowerWireService);
  });

  const since = new Date('2026-05-15T11:00:00.000Z');

  describe('backfill', () => {
    it('returns interleaved kinds in chronological order (newest first)', async () => {
      mockPrisma.alert.findMany.mockResolvedValueOnce([
        {
          alertId: 'A-1',
          tenantId: 1,
          alertType: 'hos_clash',
          priority: AlertPriority.CRITICAL,
          title: 'HOS clash in 42 min',
          message: 'Driver running over hours',
          load: { loadNumber: 'LD-001' },
          driver: { driverId: 'DRV-001' },
          createdAt: new Date('2026-05-15T11:30:00.000Z'),
        },
      ]);

      mockPrisma.conversationMessage.findMany.mockResolvedValueOnce([
        {
          messageId: 'M-1',
          content: 'Where are you?',
          role: 'driver',
          createdAt: new Date('2026-05-15T11:50:00.000Z'),
          load: { loadNumber: 'LD-001' },
        },
      ]);

      const result = await service.backfill(1, since, ['alert', 'message', 'desk', 'ops'], 50);

      expect(result).toHaveLength(2);
      expect(new Date(result[0].timestamp).getTime()).toBeGreaterThan(new Date(result[1].timestamp).getTime());
      expect(result[0].kind).toBe('message');
      expect(result[1].kind).toBe('alert');
    });

    it('filters out kinds not in the requested set', async () => {
      mockPrisma.alert.findMany.mockResolvedValueOnce([
        {
          alertId: 'A-1',
          tenantId: 1,
          alertType: 'hos_clash',
          priority: AlertPriority.CRITICAL,
          title: 'HOS clash',
          message: '',
          load: { loadNumber: 'LD-001' },
          driver: { driverId: 'DRV-001' },
          createdAt: new Date('2026-05-15T11:30:00.000Z'),
        },
      ]);

      const result = await service.backfill(1, since, ['message'], 50);

      expect(result).toHaveLength(0);
      expect(mockPrisma.alert.findMany).not.toHaveBeenCalled();
    });

    it('clamps limit to WIRE_BACKFILL_MAX_LIMIT', async () => {
      await service.backfill(1, since, ['alert'], 9999);

      // Each kind queries with the clamped limit (200)
      const alertCall = mockPrisma.alert.findMany.mock.calls[0]?.[0];
      expect(alertCall.take).toBe(200);
    });

    it('returns empty array when no items are found', async () => {
      const result = await service.backfill(1, since, ['alert', 'message', 'desk', 'ops'], 50);
      expect(result).toEqual([]);
    });

    it('scopes every query by tenantId', async () => {
      await service.backfill(99, since, ['alert', 'message', 'desk', 'ops'], 50);

      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 99 }) }),
      );
      expect(mockPrisma.deskEpisode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 99 }) }),
      );
      expect(mockPrisma.loadEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ load: { tenantId: 99 } }) }),
      );
      const msgCall = mockPrisma.conversationMessage.findMany.mock.calls[0]?.[0];
      expect(msgCall.where.conversation.tenantId).toBe(99);
    });

    it('cache key buckets `since` to 30s precision', async () => {
      await service.backfill(1, new Date('2026-05-15T11:00:14.000Z'), ['alert'], 50);
      await service.backfill(1, new Date('2026-05-15T11:00:29.000Z'), ['alert'], 50);

      // Both calls bucket into the same 30s slot
      const keys = mockCache.getOrSet.mock.calls.map((c) => c[0]);
      expect(keys[0]).toEqual(keys[1]);
    });

    it('produces Desk items only for tower-relevant responsibility types', async () => {
      mockPrisma.deskEpisode.findMany.mockResolvedValueOnce([
        {
          id: 'ep-1',
          tenantId: 1,
          entityType: 'load',
          entityId: 'LD-001',
          status: 'waiting_approval',
          outcome: null,
          openedAt: new Date('2026-05-15T11:30:00.000Z'),
          updatedAt: new Date('2026-05-15T11:30:00.000Z'),
          responsibility: { key: 'backhaul-finder', title: 'Backhaul Finder' },
        },
        {
          id: 'ep-2',
          tenantId: 1,
          entityType: 'load',
          entityId: 'LD-002',
          status: 'waiting_approval',
          outcome: null,
          openedAt: new Date('2026-05-15T11:31:00.000Z'),
          updatedAt: new Date('2026-05-15T11:31:00.000Z'),
          responsibility: { key: 'eld-violation-watcher', title: 'ELD violations' },
        },
      ]);

      const result = await service.backfill(1, since, ['desk'], 50);

      // Only backhaul-finder makes it through
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('desk');
      expect(result[0].deskAnchor?.responsibilityType).toBe('backhaul-finder');
      expect(result[0].deskAnchor?.episodeId).toBe('ep-1');
    });

    it('filters Desk to allow-listed responsibility types at the DB layer', async () => {
      await service.backfill(1, since, ['desk'], 50);

      expect(mockPrisma.deskEpisode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            responsibility: { key: { in: Array.from(TOWER_DESK_RESPONSIBILITY_ALLOW_LIST) } },
          }),
        }),
      );
    });

    it('formats persisted LoadEvent rows into ops wire items', async () => {
      mockPrisma.loadEvent.findMany.mockResolvedValueOnce([
        {
          id: 9,
          eventType: 'assigned',
          fromValue: null,
          toValue: 'DRV-1',
          description: null,
          createdAt: new Date('2026-05-15T11:45:00.000Z'),
          load: { loadNumber: 'LD-20260515-100' },
        },
        {
          id: 10,
          eventType: 'status-changed',
          fromValue: 'ASSIGNED',
          toValue: 'IN_TRANSIT',
          description: null,
          createdAt: new Date('2026-05-15T11:46:00.000Z'),
          load: { loadNumber: 'LD-20260515-100' },
        },
        {
          id: 11,
          eventType: 'unknown-thing',
          fromValue: null,
          toValue: null,
          description: null,
          createdAt: new Date('2026-05-15T11:47:00.000Z'),
          load: { loadNumber: 'LD-20260515-100' },
        },
      ]);

      const result = await service.backfill(1, since, ['ops'], 50);

      // Unknown eventType maps to a synthetic name that doesn't match the
      // switch in formatLoadEvent → produces null → filtered.
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.kind === 'ops')).toBe(true);
    });

    it('maps each LoadEvent eventType variant to the right SALLY_EVENTS name', async () => {
      mockPrisma.loadEvent.findMany.mockResolvedValueOnce([
        {
          id: 1,
          eventType: 'stop-status-changed',
          fromValue: null,
          toValue: 'arrived',
          description: null,
          createdAt: new Date('2026-05-15T11:48:00.000Z'),
          load: { loadNumber: 'LD-200' },
        },
        {
          id: 2,
          eventType: 'leg-assigned',
          fromValue: null,
          toValue: null,
          description: null,
          createdAt: new Date('2026-05-15T11:49:00.000Z'),
          load: { loadNumber: 'LD-200' },
        },
        {
          id: 3,
          eventType: 'leg-status-changed',
          fromValue: null,
          toValue: 'in_transit',
          description: null,
          createdAt: new Date('2026-05-15T11:50:00.000Z'),
          load: { loadNumber: 'LD-200' },
        },
      ]);

      const result = await service.backfill(1, since, ['ops'], 50);

      expect(result).toHaveLength(3);
    });
  });

  describe('formatLoadEvent', () => {
    // Mirrors the real LOAD_* domain-event payload — load services emit
    // `entityId` (= public load number) + `loadNumber`, never `loadId`.
    const loadEvent = (eventName: string, payload: Record<string, unknown> = {}) =>
      new DomainEvent(eventName, '1', {
        entityId: 'LD-20260515-001',
        entityType: 'load',
        loadNumber: 'LD-20260515-001',
        ...payload,
      });

    it('formats LOAD_ASSIGNED as an ops wire item', () => {
      const item = service.formatLoadEvent(loadEvent(SALLY_EVENTS.LOAD_ASSIGNED, { driverId: 'DRV-001' }));

      expect(item).not.toBeNull();
      expect(item?.kind).toBe('ops');
      expect(item?.relatedLoadId).toBe('LD-20260515-001');
    });

    it('formats LOAD_STATUS_CHANGED to IN_TRANSIT as an ops wire item', () => {
      const item = service.formatLoadEvent(
        loadEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, {
          previousStatus: LoadStatus.ASSIGNED,
          status: LoadStatus.IN_TRANSIT,
        }),
      );

      expect(item).not.toBeNull();
      expect(item?.kind).toBe('ops');
      expect(item?.text).toContain('in transit');
    });

    it('returns null for LOAD_STATUS_CHANGED transitions that are not IN_TRANSIT or DELIVERED', () => {
      const item = service.formatLoadEvent(
        loadEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, {
          previousStatus: LoadStatus.PENDING,
          status: LoadStatus.ASSIGNED,
        }),
      );

      expect(item).toBeNull();
    });

    it('formats LOAD_STOP_STATUS_CHANGED only for action stop statuses', () => {
      expect(
        service.formatLoadEvent(loadEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, { stopId: 'S-1', status: 'arrived' })),
      ).not.toBeNull();
      expect(
        service.formatLoadEvent(loadEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, { stopId: 'S-1', status: 'pending' })),
      ).toBeNull();
    });

    it('returns null for Tier-2 events (charge / document / billing)', () => {
      expect(service.formatLoadEvent(loadEvent(SALLY_EVENTS.LOAD_CHARGE_ADDED))).toBeNull();
      expect(service.formatLoadEvent(loadEvent(SALLY_EVENTS.DOCUMENT_UPLOADED))).toBeNull();
      expect(service.formatLoadEvent(loadEvent(SALLY_EVENTS.LOAD_STATUS_REVERSED))).toBeNull();
      expect(service.formatLoadEvent(loadEvent(SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED))).toBeNull();
    });

    it('formats LOAD_STATUS_CHANGED to DELIVERED', () => {
      const item = service.formatLoadEvent(
        loadEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, {
          previousStatus: LoadStatus.IN_TRANSIT,
          status: LoadStatus.DELIVERED,
        }),
      );
      expect(item?.text).toContain('delivered');
    });

    it('formats LOAD_LEG_ASSIGNED and LOAD_LEG_STATUS_CHANGED', () => {
      // Leg events carry the leg id in `entityId` and the load number in `loadId`.
      const legAssigned = service.formatLoadEvent(
        new DomainEvent(SALLY_EVENTS.LOAD_LEG_ASSIGNED, '1', {
          entityId: 'LEG-1',
          entityType: 'load',
          legId: 'LEG-1',
          loadId: 'LD-20260515-001',
          driverId: 'DRV-001',
        }),
      );
      expect(legAssigned?.kind).toBe('ops');
      expect(legAssigned?.relatedLoadId).toBe('LD-20260515-001');

      const legChanged = service.formatLoadEvent(
        new DomainEvent(SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED, '1', {
          entityId: 'LEG-1',
          entityType: 'load',
          legId: 'LEG-1',
          loadId: 'LD-20260515-001',
          newStatus: 'in_transit',
        }),
      );
      expect(legChanged?.kind).toBe('ops');
      expect(legChanged?.text).toContain('in_transit');
    });

    it('returns null when domain event has no load identifier', () => {
      const event = new DomainEvent(SALLY_EVENTS.LOAD_ASSIGNED, '1', {});
      expect(service.formatLoadEvent(event)).toBeNull();
    });
  });

  describe('formatAlert', () => {
    it('formats alerts as wire items with severity from priority', () => {
      const item = service.formatAlert({
        alertId: 'A-1',
        priority: AlertPriority.CRITICAL,
        title: 'HOS clash in 42 min',
        message: '',
        load: { loadNumber: 'LD-001' },
        driver: { driverId: 'DRV-001' },
        createdAt: new Date('2026-05-15T11:30:00.000Z'),
      });

      expect(item.kind).toBe('alert');
      expect(item.severity).toBe('critical');
      expect(item.text).toBe('HOS clash in 42 min');
      expect(item.relatedLoadId).toBe('LD-001');
    });

    it('attaches a mute action carrying the alert id', () => {
      const item = service.formatAlert({
        alertId: 'A-9',
        priority: AlertPriority.HIGH,
        title: 'Detention building at Acme DC',
        message: '',
        load: { loadNumber: 'LD-001' },
        driver: { driverId: 'DRV-001' },
        createdAt: new Date('2026-05-15T11:30:00.000Z'),
      });

      const muteAction = item.actions?.find((a) => a.kind === 'mute');
      expect(muteAction).toBeDefined();
      expect(muteAction?.payload).toEqual({ alertId: 'A-9' });
    });

    it('maps medium priority to caution', () => {
      const item = service.formatAlert({
        alertId: 'A-2',
        priority: AlertPriority.MEDIUM,
        title: 'Weather watch',
        message: '',
        load: null,
        driver: { driverId: 'DRV-002' },
        createdAt: new Date('2026-05-15T11:30:00.000Z'),
      });

      expect(item.severity).toBe('caution');
    });
  });

  describe('formatMessage', () => {
    it('formats a conversation message as a wire item', () => {
      const item = service.formatMessage({
        messageId: 'M-1',
        content: 'Where are you?',
        role: 'driver',
        createdAt: new Date('2026-05-15T11:50:00.000Z'),
      });

      expect(item.kind).toBe('message');
      expect(item.severity).toBe('info');
      expect(item.text).toContain('Where are you');
    });

    it("derives relatedLoadId + reference from the message's load tag", () => {
      const item = service.formatMessage({
        messageId: 'M-2',
        content: 'On my way',
        role: 'driver',
        createdAt: new Date('2026-05-15T11:50:00.000Z'),
        load: { loadNumber: 'LD-001', referenceNumber: 'PO-12345' },
      });

      expect(item.relatedLoadId).toBe('LD-001');
      expect(item.relatedLoadReference).toBe('PO-12345');
    });

    it('leaves relatedLoadId undefined for an untagged (general) message', () => {
      const item = service.formatMessage({
        messageId: 'M-3',
        content: 'Hello',
        role: 'driver',
        createdAt: new Date('2026-05-15T11:50:00.000Z'),
        load: null,
      });

      expect(item.relatedLoadId).toBeUndefined();
    });

    it('carries the driver name + id from the conversation', () => {
      const item = service.formatMessage({
        messageId: 'M-4',
        content: 'On my way',
        role: 'driver',
        createdAt: new Date('2026-05-15T11:50:00.000Z'),
        conversation: { driver: { driverId: 'DRV-001', name: 'Mike Reyes' } },
      });

      expect(item.relatedDriverId).toBe('DRV-001');
      expect(item.relatedDriverName).toBe('Mike Reyes');
    });

    it('leaves driver fields undefined when the conversation has no driver', () => {
      const item = service.formatMessage({
        messageId: 'M-5',
        content: 'Hello',
        role: 'driver',
        createdAt: new Date('2026-05-15T11:50:00.000Z'),
        conversation: { driver: null },
      });

      expect(item.relatedDriverId).toBeUndefined();
      expect(item.relatedDriverName).toBeUndefined();
    });
  });

  describe('formatDeskOutput', () => {
    it('formats an allow-listed desk episode as a wire item with deskAnchor', () => {
      const item = service.formatDeskOutput({
        id: 'ep-1',
        entityType: 'load',
        entityId: 'LD-001',
        openedAt: new Date('2026-05-15T11:30:00.000Z'),
        updatedAt: new Date('2026-05-15T11:30:00.000Z'),
        status: 'waiting_approval',
        outcome: null,
        responsibility: { key: 'backhaul-finder', title: 'Backhaul Finder' },
      });

      expect(item).not.toBeNull();
      expect(item?.kind).toBe('desk');
      expect(item?.deskAnchor?.responsibilityType).toBe('backhaul-finder');
      expect(item?.deskAnchor?.episodeId).toBe('ep-1');
    });

    it('attaches accept/decline actions carrying the pending approval id', () => {
      const item = service.formatDeskOutput({
        id: 'ep-3',
        entityType: 'load',
        entityId: 'LD-003',
        openedAt: new Date('2026-05-15T11:30:00.000Z'),
        updatedAt: new Date('2026-05-15T11:30:00.000Z'),
        status: 'waiting_approval',
        outcome: null,
        responsibility: { key: 'backhaul-finder', title: 'Backhaul Finder' },
        approvals: [{ id: 'AP-7' }],
      });

      const acceptAction = item?.actions?.find((a) => a.kind === 'accept-desk');
      const declineAction = item?.actions?.find((a) => a.kind === 'decline-desk');
      expect(acceptAction?.payload).toEqual({ approvalId: 'AP-7' });
      expect(declineAction?.payload).toEqual({ approvalId: 'AP-7' });
    });

    it('omits accept/decline actions when the episode has no pending approval', () => {
      const item = service.formatDeskOutput({
        id: 'ep-4',
        entityType: 'load',
        entityId: 'LD-004',
        openedAt: new Date('2026-05-15T11:30:00.000Z'),
        updatedAt: new Date('2026-05-15T11:30:00.000Z'),
        status: 'running',
        outcome: null,
        responsibility: { key: 'backhaul-finder', title: 'Backhaul Finder' },
        approvals: [],
      });

      expect(item?.actions).toBeUndefined();
    });

    it('includes only undecided approvals in the desk episode query', async () => {
      await service.backfill(1, since, ['desk'], 50);

      const deskCall = mockPrisma.deskEpisode.findMany.mock.calls[0]?.[0];
      expect(deskCall.include.approvals.where).toEqual({ decision: null });
    });

    it('returns null when responsibility type is not in allow-list', () => {
      const item = service.formatDeskOutput({
        id: 'ep-2',
        entityType: 'load',
        entityId: 'LD-002',
        openedAt: new Date('2026-05-15T11:30:00.000Z'),
        updatedAt: new Date('2026-05-15T11:30:00.000Z'),
        status: 'waiting_approval',
        outcome: null,
        responsibility: { key: 'unknown-thing', title: 'Unknown' },
      });

      expect(item).toBeNull();
    });
  });
});
