import { SSE_EVENTS } from '../sse-events.constants';

describe('SSE_EVENTS', () => {
  it('should export all event types as strings', () => {
    expect(SSE_EVENTS.NOTIFICATION_NEW).toBe('notification:new');
    expect(SSE_EVENTS.USER_INVITED).toBe('user:invited');
    expect(SSE_EVENTS.HEARTBEAT).toBe('heartbeat');
  });

  it('should have unique values', () => {
    const values = Object.values(SSE_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('exposes the generic platform event set', () => {
    expect(SSE_EVENTS.TENANT_UPDATED).toBe('tenant:updated');
    expect(SSE_EVENTS.INTEGRATION_SYNCED).toBe('integration:synced');
    expect(SSE_EVENTS.AI_MESSAGE).toBe('ai:message');
  });
});
