import { Test, TestingModule } from '@nestjs/testing';
import { LoadStatus } from '@prisma/client';
import { DomainEvent } from '../../../../../infrastructure/events/domain-event';
import { SSE_EVENTS } from '../../../../../infrastructure/sse/sse-events.constants';
import { SseService } from '../../../../../infrastructure/sse/sse.service';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';
import { TowerWireService } from '../tower-wire.service';
import { TowerSseSubscriber } from '../tower-sse.subscriber';
import { TOWER_RISK_TRANSITION_EVENT } from '../risk-score.service';

describe('TowerSseSubscriber', () => {
  let subscriber: TowerSseSubscriber;
  let sse: { emitToTenant: jest.Mock };
  let wire: TowerWireService;

  beforeEach(async () => {
    sse = { emitToTenant: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TowerSseSubscriber,
        { provide: SseService, useValue: sse },
        TowerWireService,
        { provide: 'PrismaService', useValue: {} },
        // SallyCacheService never invoked by the subscriber, but TowerWireService
        // expects it for backfill; provide a no-op stub.
        { provide: 'SallyCacheService', useValue: { getOrSet: jest.fn() } },
      ],
    })
      .overrideProvider(TowerWireService)
      .useFactory({
        factory: () => new TowerWireService({} as any, {} as any),
      })
      .compile();

    subscriber = module.get(TowerSseSubscriber);
    wire = module.get(TowerWireService);
  });

  it('emits TOWER_WIRE_ITEM_ADDED for Tier-1 LOAD_STATUS_CHANGED to IN_TRANSIT', () => {
    // Mirrors the real LOAD_STATUS_CHANGED domain-event payload.
    const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
      entityId: 'LD-20260515-001',
      entityType: 'load',
      loadNumber: 'LD-20260515-001',
      status: LoadStatus.IN_TRANSIT,
      previousStatus: LoadStatus.ASSIGNED,
    });

    subscriber.onLoadStatusChanged(event);

    expect(sse.emitToTenant).toHaveBeenCalledWith(
      1,
      SSE_EVENTS.TOWER_WIRE_ITEM_ADDED,
      expect.objectContaining({ kind: 'ops' }),
    );
  });

  it('does NOT emit wire for Tier-2 LOAD_STATUS_CHANGED transitions', () => {
    const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '1', {
      entityId: 'LD-20260515-001',
      entityType: 'load',
      loadNumber: 'LD-20260515-001',
      status: LoadStatus.PENDING,
      previousStatus: LoadStatus.DRAFT,
    });

    subscriber.onLoadStatusChanged(event);

    expect(sse.emitToTenant).not.toHaveBeenCalled();
  });

  it('emits TOWER_WIRE_ITEM_ADDED + TOWER_MESSAGES_CHANGED for MESSAGE_NEW', () => {
    const event = new DomainEvent(SALLY_EVENTS.MESSAGE_NEW, '5', {
      messageId: 'M-1',
      content: 'where are you',
      role: 'driver',
      conversationId: 'C-1',
    });

    subscriber.onMessageNew(event);

    const types = sse.emitToTenant.mock.calls.map((c) => c[1]);
    expect(types).toContain(SSE_EVENTS.TOWER_WIRE_ITEM_ADDED);
    expect(types).toContain(SSE_EVENTS.TOWER_MESSAGES_CHANGED);
  });

  it('emits TOWER_ALERTS_CHANGED + wire for ALERT_FIRED with relatedLoadId from loadNumber', () => {
    // Mirrors the real ALERT_FIRED payload emitted by AlertGenerationService:
    // the load reference travels as `loadNumber` (public slug), not `loadId`.
    const event = new DomainEvent(SALLY_EVENTS.ALERT_FIRED, '5', {
      alertId: 'A-1',
      priority: 'critical',
      title: 'HOS clash in 42 min',
      loadNumber: 'LD-1',
      driverId: 'DRV-1',
    });

    subscriber.onAlertFired(event);

    const types = sse.emitToTenant.mock.calls.map((c) => c[1]);
    expect(types).toContain(SSE_EVENTS.TOWER_WIRE_ITEM_ADDED);
    expect(types).toContain(SSE_EVENTS.TOWER_ALERTS_CHANGED);

    // The live wire item must carry the load reference so the "Open load"
    // action works — not just the cached backfill path.
    const wireCall = sse.emitToTenant.mock.calls.find((c) => c[1] === SSE_EVENTS.TOWER_WIRE_ITEM_ADDED);
    expect(wireCall?.[2]).toMatchObject({
      kind: 'alert',
      relatedLoadId: 'LD-1',
      relatedDriverId: 'DRV-1',
    });
  });

  it('falls back to loadId when an ALERT_FIRED payload omits loadNumber', () => {
    const event = new DomainEvent(SALLY_EVENTS.ALERT_FIRED, '5', {
      alertId: 'A-3',
      priority: 'high',
      title: 'Detention risk',
      loadId: 'LD-9',
    });

    subscriber.onAlertFired(event);

    const wireCall = sse.emitToTenant.mock.calls.find((c) => c[1] === SSE_EVENTS.TOWER_WIRE_ITEM_ADDED);
    expect(wireCall?.[2]).toMatchObject({ relatedLoadId: 'LD-9' });
  });

  it('emits desk wire only when responsibility type is allow-listed', () => {
    const allowed = new DomainEvent(SALLY_EVENTS.DESK_DECISION_CREATED, '5', {
      episodeId: 'ep-1',
      responsibilityType: 'backhaul-finder',
      responsibilityTitle: 'Backhaul Finder',
      entityType: 'load',
      entityId: 'LD-1',
    });
    subscriber.onDeskDecisionCreated(allowed);

    const notAllowed = new DomainEvent(SALLY_EVENTS.DESK_DECISION_CREATED, '5', {
      episodeId: 'ep-2',
      responsibilityType: 'ar-followup',
      entityType: 'invoice',
      entityId: 'INV-1',
    });
    subscriber.onDeskDecisionCreated(notAllowed);

    const wireCalls = sse.emitToTenant.mock.calls.filter((c) => c[1] === SSE_EVENTS.TOWER_WIRE_ITEM_ADDED);
    expect(wireCalls).toHaveLength(1);
    const payload = wireCalls[0][2];
    expect(payload.kind).toBe('desk');
    expect(payload.deskAnchor.responsibilityType).toBe('backhaul-finder');
    expect(payload.deskAnchor.episodeId).toBe('ep-1');
  });

  it('emits TOWER_RISK_TRANSITION scoped to the affected tenant', () => {
    subscriber.onTowerRiskTransition({
      tenantId: 42,
      loadId: 'LD-1',
      driverId: 'DRV-1',
      fromBand: 'on-track',
      toBand: 'at-risk',
      score: 65,
    });

    expect(sse.emitToTenant).toHaveBeenCalledWith(
      42,
      SSE_EVENTS.TOWER_RISK_TRANSITION,
      expect.objectContaining({ toBand: 'at-risk', score: 65 }),
    );
  });

  it('drops events with non-numeric tenantId', () => {
    const event = new DomainEvent(SALLY_EVENTS.ALERT_FIRED, 'not-a-number', {
      alertId: 'A-2',
      priority: 'high',
      title: 'X',
    });

    subscriber.onAlertFired(event);

    expect(sse.emitToTenant).not.toHaveBeenCalled();
  });

  it('handles every Tier-1 load event variant', () => {
    // Each `data` mirrors the real domain-event payload — load events use
    // `entityId`/`loadNumber`, leg events use `entityId` (legId) + `loadId`.
    const variants: Array<{ event: string; data: Record<string, unknown> }> = [
      {
        event: SALLY_EVENTS.LOAD_ASSIGNED,
        data: { entityId: 'LD-1', entityType: 'load', loadNumber: 'LD-1', driverId: 'D-1' },
      },
      {
        event: SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED,
        data: { entityId: 'LD-2', entityType: 'load', loadNumber: 'LD-2', stopId: 'S-1', status: 'arrived' },
      },
      {
        event: SALLY_EVENTS.LOAD_LEG_ASSIGNED,
        data: { entityId: 'LEG-3', entityType: 'load', legId: 'LEG-3', loadId: 'LD-3', driverId: 'D-3' },
      },
      {
        event: SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED,
        data: { entityId: 'LEG-4', entityType: 'load', legId: 'LEG-4', loadId: 'LD-4', newStatus: 'in_transit' },
      },
    ];

    for (const v of variants) {
      const e = new DomainEvent(v.event, '1', v.data);
      switch (v.event) {
        case SALLY_EVENTS.LOAD_ASSIGNED:
          subscriber.onLoadAssigned(e);
          break;
        case SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED:
          subscriber.onLoadStopStatusChanged(e);
          break;
        case SALLY_EVENTS.LOAD_LEG_ASSIGNED:
          subscriber.onLoadLegAssigned(e);
          break;
        case SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED:
          subscriber.onLoadLegStatusChanged(e);
          break;
      }
    }

    expect(sse.emitToTenant).toHaveBeenCalledTimes(4);
  });

  it('handles ALERT_ESCALATED and ALERT_RESOLVED via dedicated listeners', () => {
    const base = (eventName: string) =>
      new DomainEvent(eventName, '1', {
        alertId: 'A-9',
        priority: 'high',
        title: 'Late',
      });

    subscriber.onAlertEscalated(base(SALLY_EVENTS.ALERT_ESCALATED));
    subscriber.onAlertResolved(base(SALLY_EVENTS.ALERT_RESOLVED));

    // Each call fires 2 SSE emits (wire + alerts-changed)
    expect(sse.emitToTenant).toHaveBeenCalledTimes(4);
  });

  it('handles DESK_AUTO_APPROVED and DESK_ACTION_EXECUTED via dedicated listeners', () => {
    const data = {
      episodeId: 'ep-3',
      responsibilityType: 'rate-con-triage',
      responsibilityTitle: 'Rate-con triage',
      entityType: 'load',
      entityId: 'LD-10',
    };
    subscriber.onDeskAutoApproved(new DomainEvent(SALLY_EVENTS.DESK_AUTO_APPROVED, '1', data));
    subscriber.onDeskActionExecuted(new DomainEvent(SALLY_EVENTS.DESK_ACTION_EXECUTED, '1', data));

    const wireCalls = sse.emitToTenant.mock.calls.filter((c) => c[1] === SSE_EVENTS.TOWER_WIRE_ITEM_ADDED);
    expect(wireCalls).toHaveLength(2);
  });
});
