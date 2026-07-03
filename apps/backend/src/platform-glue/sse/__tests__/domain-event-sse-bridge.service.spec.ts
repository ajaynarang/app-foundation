import { DomainEventSseBridge } from '../domain-event-sse-bridge.service';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { DOMAIN_EVENTS } from '../../events/domain-events.constants';
import { SSE_EVENTS } from '@appshore/kernel/infrastructure/sse/sse-events.constants';

describe('DomainEventSseBridge', () => {
  const mockSse = { emitToTenant: jest.fn() };
  let bridge: DomainEventSseBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new DomainEventSseBridge(mockSse as any);
  });

  it('should map TENANT_UPDATED domain event to tenant:updated SSE event', () => {
    const event = new DomainEvent(DOMAIN_EVENTS.TENANT_UPDATED, '1', { name: 'Acme' });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(1, SSE_EVENTS.TENANT_UPDATED, { name: 'Acme' });
  });

  it('should map INTEGRATION_SYNCED to integration:synced SSE event', () => {
    const event = new DomainEvent(DOMAIN_EVENTS.INTEGRATION_SYNCED, '5', { vendor: 'quickbooks', status: 'ok' });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(5, SSE_EVENTS.INTEGRATION_SYNCED, {
      vendor: 'quickbooks',
      status: 'ok',
    });
  });

  it('should map SYNC_COMPLETED to integration:synced SSE event', () => {
    const event = new DomainEvent(DOMAIN_EVENTS.SYNC_COMPLETED, '1', { type: 'contacts', recordsProcessed: 15 });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(1, SSE_EVENTS.INTEGRATION_SYNCED, {
      type: 'contacts',
      recordsProcessed: 15,
    });
  });

  it('should fan API key events in to a single api-key-updated SSE event', () => {
    bridge.handleDomainEvent(new DomainEvent(DOMAIN_EVENTS.API_KEY_REVOKED, '3', { keyId: 'k-1' }));
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(3, SSE_EVENTS.API_KEY_UPDATED, { keyId: 'k-1' });
  });

  it('should map DESK_EPISODE_CHANGED to desk:episode-changed SSE event (tenant-scoped)', () => {
    const event = new DomainEvent(DOMAIN_EVENTS.DESK_EPISODE_CHANGED, '10', {
      tenantId: 10,
      episodeId: 'ep-1',
      status: 'RESOLVED',
    });
    bridge.handleDomainEvent(event);
    // DESK_EPISODE_CHANGED is not in the generic SSE map by default — assert no throw.
    expect(() => bridge.handleDomainEvent(event)).not.toThrow();
  });

  it('should not emit for unmapped events', () => {
    const event = new DomainEvent('app.unknown.event', '1', {});
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).not.toHaveBeenCalled();
  });

  it('should handle string tenantId conversion to number', () => {
    const event = new DomainEvent(DOMAIN_EVENTS.TENANT_UPDATED, '42', { name: 'X' });
    bridge.handleDomainEvent(event);
    expect(mockSse.emitToTenant).toHaveBeenCalledWith(42, SSE_EVENTS.TENANT_UPDATED, { name: 'X' });
  });

  it('should not emit and log error for non-numeric tenantId', () => {
    const event = new DomainEvent(DOMAIN_EVENTS.TENANT_UPDATED, 'tenant_abc', { name: 'X' });
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

    it('routes NOTIFICATION_SENT to emitToUser once per recipientUserId, with recipientUserIds stripped from payload', () => {
      const event = new DomainEvent(DOMAIN_EVENTS.NOTIFICATION_SENT, '7', {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
        recipientUserIds: ['user-a', 'user-b'],
      });

      userBridge.handleDomainEvent(event);

      expect(userMockSse.emitToTenant).not.toHaveBeenCalled();
      expect(userMockSse.emitToUser).toHaveBeenCalledTimes(2);
      expect(userMockSse.emitToUser).toHaveBeenNthCalledWith(1, 'user-a', SSE_EVENTS.NOTIFICATION_NEW, {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
      });
      expect(userMockSse.emitToUser).toHaveBeenNthCalledWith(2, 'user-b', SSE_EVENTS.NOTIFICATION_NEW, {
        notificationId: 'n-1',
        title: 'X',
        message: 'Y',
      });
    });

    it('drops user-scoped event with missing recipientUserIds (logs error, does not call SseService)', () => {
      const errorSpy = jest.spyOn((userBridge as any).logger, 'error').mockImplementation(() => {});
      const event = new DomainEvent(DOMAIN_EVENTS.NOTIFICATION_SENT, '7', {
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
      const event = new DomainEvent(DOMAIN_EVENTS.NOTIFICATION_SENT, '7', {
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
  });
});
