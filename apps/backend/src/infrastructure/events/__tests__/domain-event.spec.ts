import { DomainEvent, EventActor } from '../domain-event';

describe('DomainEvent', () => {
  it('creates event with required fields only (backward compat)', () => {
    const event = new DomainEvent('sally.load.created', 'tenant-1', {
      loadId: 'LD-1',
    });
    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeInstanceOf(Date);
    expect(event.event).toBe('sally.load.created');
    expect(event.tenantId).toBe('tenant-1');
    expect(event.data).toEqual({ loadId: 'LD-1' });
    expect(event.version).toBe(1);
    expect(event.actor).toBeUndefined();
    expect(event.correlationId).toBeUndefined();
    expect(event.causationId).toBeUndefined();
  });

  it('creates event with actor and correlation metadata', () => {
    const actor: EventActor = {
      id: 'user-1',
      type: 'user',
      label: 'John D.',
    };
    const event = new DomainEvent(
      'sally.load.assigned',
      'tenant-1',
      { loadId: 'LD-1' },
      actor,
      'corr-123',
      'cause-456',
    );
    expect(event.actor).toEqual(actor);
    expect(event.correlationId).toBe('corr-123');
    expect(event.causationId).toBe('cause-456');
    expect(event.version).toBe(1);
  });

  it('generates unique IDs for each event', () => {
    const e1 = new DomainEvent('sally.load.created', 't1', {});
    const e2 = new DomainEvent('sally.load.created', 't1', {});
    expect(e1.id).not.toBe(e2.id);
  });

  it('sets timestamp close to current time', () => {
    const before = new Date();
    const event = new DomainEvent('sally.load.created', 't1', {});
    const after = new Date();
    expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('preserves generic type parameter', () => {
    interface TestPayload {
      entityId: string;
      entityType: string;
    }
    const event = new DomainEvent<TestPayload>('sally.load.created', 't1', {
      entityId: 'LD-1',
      entityType: 'load',
    });
    expect(event.data.entityId).toBe('LD-1');
    expect(event.data.entityType).toBe('load');
  });

  describe('fromSerialized', () => {
    it('reconstructs event with original id, timestamp, and version', () => {
      const event = DomainEvent.fromSerialized({
        id: 'original-id',
        event: 'sally.load.created',
        tenantId: 'tenant-1',
        data: { entityId: 'LD-1' },
        actor: { id: 'u-1', type: 'user', label: 'John' },
        correlationId: 'corr-1',
        causationId: null,
        version: 1,
        timestamp: '2026-04-10T12:00:00.000Z',
      });

      expect(event.id).toBe('original-id');
      expect(event.event).toBe('sally.load.created');
      expect(event.tenantId).toBe('tenant-1');
      expect(event.data).toEqual({ entityId: 'LD-1' });
      expect(event.actor).toEqual({ id: 'u-1', type: 'user', label: 'John' });
      expect(event.correlationId).toBe('corr-1');
      expect(event.causationId).toBeUndefined();
      expect(event.version).toBe(1);
      expect(event.timestamp).toEqual(new Date('2026-04-10T12:00:00.000Z'));
    });

    it('handles null actor', () => {
      const event = DomainEvent.fromSerialized({
        id: 'id-1',
        event: 'sally.sync.started',
        tenantId: 't-1',
        data: {},
        actor: null,
        correlationId: null,
        causationId: null,
        version: 1,
        timestamp: '2026-04-10T00:00:00.000Z',
      });

      expect(event.actor).toBeUndefined();
    });

    it('is an instanceof DomainEvent', () => {
      const event = DomainEvent.fromSerialized({
        id: 'id-1',
        event: 'sally.load.created',
        tenantId: 't-1',
        data: {},
        actor: null,
        correlationId: null,
        causationId: null,
        version: 1,
        timestamp: '2026-04-10T00:00:00.000Z',
      });

      expect(event).toBeInstanceOf(DomainEvent);
    });
  });
});
