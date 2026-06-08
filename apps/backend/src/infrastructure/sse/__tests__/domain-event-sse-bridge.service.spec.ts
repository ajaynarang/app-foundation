import { DomainEventSseBridge } from '../domain-event-sse-bridge.service';
import { DomainEvent } from '../../events/domain-event';
import { SALLY_EVENTS } from '../../events/sally-events.constants';
import { SSE_EVENTS } from '../sse-events.constants';

describe('DomainEventSseBridge', () => {
  const mockSse = { emitToTenant: jest.fn() };
  let bridge: DomainEventSseBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new DomainEventSseBridge(mockSse as any);
  });

  it('should map LOAD_CREATED domain event to load:created SSE event', () => {
    const event = new DomainEvent(SALLY_EVENTS.LOAD_CREATED, '1', {
      loadId: 'L-001',
      loadNumber: 'LOAD-001',
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(1, SSE_EVENTS.LOAD_CREATED, {
      loadId: 'L-001',
      loadNumber: 'LOAD-001',
    });
  });

  it('should map LOAD_STATUS_CHANGED to load:status-changed SSE event', () => {
    const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '5', {
      loadId: 'L-002',
      status: 'IN_TRANSIT',
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(5, SSE_EVENTS.LOAD_STATUS_CHANGED, {
      loadId: 'L-002',
      status: 'IN_TRANSIT',
    });
  });

  it('should map LOAD_BILLING_STATUS_CHANGED to load:billing-status-changed', () => {
    const event = new DomainEvent(SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED, '3', {
      loadId: 'L-003',
      billingStatus: 'APPROVED',
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(3, SSE_EVENTS.LOAD_BILLING_STATUS_CHANGED, {
      loadId: 'L-003',
      billingStatus: 'APPROVED',
    });
  });

  it('should map SYNC_COMPLETED to sync:completed SSE event', () => {
    const event = new DomainEvent(SALLY_EVENTS.SYNC_COMPLETED, '1', {
      type: 'loads',
      recordsProcessed: 15,
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(1, SSE_EVENTS.SYNC_COMPLETED, {
      type: 'loads',
      recordsProcessed: 15,
    });
  });

  it('should map DESK_EPISODE_CHANGED to desk:episode-changed SSE event (tenant-scoped)', () => {
    const event = new DomainEvent(SALLY_EVENTS.DESK_EPISODE_CHANGED, '10', {
      tenantId: 10,
      episodeId: 'ep-1',
      status: 'RESOLVED',
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(10, SSE_EVENTS.DESK_EPISODE_CHANGED, {
      tenantId: 10,
      episodeId: 'ep-1',
      status: 'RESOLVED',
    });
  });

  it('should not emit for unmapped events', () => {
    const event = new DomainEvent('sally.unknown.event', '1', {});
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).not.toHaveBeenCalled();
  });

  it('should handle string tenantId conversion to number', () => {
    const event = new DomainEvent(SALLY_EVENTS.LOAD_DELETED, '42', {
      loadId: 'L-004',
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(42, SSE_EVENTS.LOAD_DELETED, { loadId: 'L-004' });
  });

  it('should not emit and log error for non-numeric tenantId', () => {
    const event = new DomainEvent(SALLY_EVENTS.LOAD_CREATED, 'tenant_abc', {
      loadId: 'L-005',
    });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).not.toHaveBeenCalled();
  });

  describe('user-scoped routing', () => {
    let userMockSse: { emitToTenant: jest.Mock; emitToUser: jest.Mock };
    let userBridge: DomainEventSseBridge;

    beforeEach(() => {
      userMockSse = { emitToTenant: jest.fn(), emitToUser: jest.fn() };
      userBridge = new DomainEventSseBridge(userMockSse as any);
    });

    it('routes ALERT_FIRED to emitToUser once per recipientUserId, with recipientUserIds stripped from payload', () => {
      const event = new DomainEvent(SALLY_EVENTS.ALERT_FIRED, '7', {
        alertId: 'a-1',
        priority: 'critical',
        title: 'X',
        message: 'Y',
        recipientUserIds: ['user-a', 'user-b'],
      });

      userBridge.handleDomainEvent(event);

      expect(userMockSse.emitToTenant).not.toHaveBeenCalled();
      expect(userMockSse.emitToUser).toHaveBeenCalledTimes(2);
      expect(userMockSse.emitToUser).toHaveBeenNthCalledWith(1, 'user-a', SSE_EVENTS.ALERT_NEW, {
        alertId: 'a-1',
        priority: 'critical',
        title: 'X',
        message: 'Y',
      });
      expect(userMockSse.emitToUser).toHaveBeenNthCalledWith(2, 'user-b', SSE_EVENTS.ALERT_NEW, {
        alertId: 'a-1',
        priority: 'critical',
        title: 'X',
        message: 'Y',
      });
    });

    it('drops user-scoped event with missing recipientUserIds (logs error, does not call SseService)', () => {
      const errorSpy = jest.spyOn((userBridge as any).logger, 'error').mockImplementation(() => {});
      const event = new DomainEvent(SALLY_EVENTS.NOTIFICATION_SENT, '7', {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
        // recipientUserIds missing
      });

      userBridge.handleDomainEvent(event);

      expect(userMockSse.emitToUser).not.toHaveBeenCalled();
      expect(userMockSse.emitToTenant).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('skips non-string entries in recipientUserIds (defense in depth)', () => {
      const event = new DomainEvent(SALLY_EVENTS.NOTIFICATION_SENT, '7', {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
        recipientUserIds: ['user-a', 42, null, '', 'user-b'],
      });

      userBridge.handleDomainEvent(event);

      expect(userMockSse.emitToUser).toHaveBeenCalledTimes(2);
      expect(userMockSse.emitToUser).toHaveBeenNthCalledWith(
        1,
        'user-a',
        SSE_EVENTS.NOTIFICATION_NEW,
        expect.any(Object),
      );
      expect(userMockSse.emitToUser).toHaveBeenNthCalledWith(
        2,
        'user-b',
        SSE_EVENTS.NOTIFICATION_NEW,
        expect.any(Object),
      );
    });

    it('routes LOAD_BOARD_ALERT_FIRED to emitToUser with stripped payload', () => {
      const event = new DomainEvent(SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED, '7', {
        savedSearchId: 'ss-1',
        name: 'Hot Lanes',
        newCount: 3,
        recipientUserIds: ['user-owner'],
      });

      userBridge.handleDomainEvent(event);

      expect(userMockSse.emitToUser).toHaveBeenCalledTimes(1);
      expect(userMockSse.emitToUser).toHaveBeenCalledWith('user-owner', SSE_EVENTS.LOAD_BOARD_ALERT, {
        savedSearchId: 'ss-1',
        name: 'Hot Lanes',
        newCount: 3,
      });
    });
  });

  describe('Tower v3 fan-out', () => {
    it('emits TOWER_LOAD_CHANGED for Tier-1 LOAD_STATUS_CHANGED', () => {
      const event = new DomainEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, '7', {
        loadId: 'LD-1',
        to: 'IN_TRANSIT',
      });

      bridge.handleDomainEvent(event);

      // Primary mapping + tower fan-out
      expect(mockSse.emitToTenant).toHaveBeenCalledWith(7, SSE_EVENTS.LOAD_STATUS_CHANGED, expect.any(Object));
      expect(mockSse.emitToTenant).toHaveBeenCalledWith(7, SSE_EVENTS.TOWER_LOAD_CHANGED, expect.any(Object));
    });

    it('emits TOWER_LOAD_CHANGED for Tier-2 LOAD_CHARGE_ADDED (no wire item)', () => {
      const event = new DomainEvent(SALLY_EVENTS.LOAD_CHARGE_ADDED, '3', { loadId: 'LD-2' });

      bridge.handleDomainEvent(event);

      // No primary mapping for LOAD_CHARGE_ADDED, but tower fan-out still fires
      const calls = mockSse.emitToTenant.mock.calls;
      expect(calls.some((c) => c[1] === SSE_EVENTS.TOWER_LOAD_CHANGED)).toBe(true);
    });

    it('emits TOWER_LOAD_CHANGED for DOCUMENT_UPLOADED', () => {
      const event = new DomainEvent(SALLY_EVENTS.DOCUMENT_UPLOADED, '1', { loadId: 'LD-3' });

      bridge.handleDomainEvent(event);

      const calls = mockSse.emitToTenant.mock.calls;
      expect(calls.some((c) => c[1] === SSE_EVENTS.TOWER_LOAD_CHANGED)).toBe(true);
    });

    it('does NOT emit TOWER_LOAD_CHANGED for non-load events', () => {
      const event = new DomainEvent(SALLY_EVENTS.MESSAGE_NEW, '1', { messageId: 'M-1' });

      bridge.handleDomainEvent(event);

      const calls = mockSse.emitToTenant.mock.calls;
      expect(calls.some((c) => c[1] === SSE_EVENTS.TOWER_LOAD_CHANGED)).toBe(false);
    });

    it('emits tower events only to the affected tenant', () => {
      const event = new DomainEvent(SALLY_EVENTS.LOAD_ASSIGNED, '99', { loadId: 'LD-5' });

      bridge.handleDomainEvent(event);

      const towerCall = mockSse.emitToTenant.mock.calls.find((c) => c[1] === SSE_EVENTS.TOWER_LOAD_CHANGED);
      expect(towerCall?.[0]).toBe(99);
    });
  });
});
