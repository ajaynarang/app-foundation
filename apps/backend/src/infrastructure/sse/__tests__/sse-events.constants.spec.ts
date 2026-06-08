import { SSE_EVENTS } from '../sse-events.constants';

describe('SSE_EVENTS', () => {
  it('should export all event types as strings', () => {
    expect(SSE_EVENTS.LOAD_CREATED).toBe('load:created');
    expect(SSE_EVENTS.ALERT_NEW).toBe('alert:new');
    expect(SSE_EVENTS.HEARTBEAT).toBe('heartbeat');
  });

  it('should have unique values', () => {
    const values = Object.values(SSE_EVENTS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('exposes Tower v3 event kinds', () => {
    expect(SSE_EVENTS.TOWER_LOAD_CHANGED).toBe('tower:load-changed');
    expect(SSE_EVENTS.TOWER_WIRE_ITEM_ADDED).toBe('tower:wire-item-added');
    expect(SSE_EVENTS.TOWER_RISK_TRANSITION).toBe('tower:risk-transition');
    expect(SSE_EVENTS.TOWER_ALERTS_CHANGED).toBe('tower:alerts-changed');
    expect(SSE_EVENTS.TOWER_MESSAGES_CHANGED).toBe('tower:messages-changed');
  });
});
