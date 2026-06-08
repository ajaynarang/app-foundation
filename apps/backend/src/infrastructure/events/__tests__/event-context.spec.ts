import { EventContext } from '../event-context';
import { DomainEvent, EventActor } from '../domain-event';

describe('EventContext', () => {
  it('returns undefined when not inside a context', () => {
    expect(EventContext.getActor()).toBeUndefined();
  });

  it('makes actor available inside run()', () => {
    const actor: EventActor = { id: 'u-1', type: 'user', label: 'Alice' };

    EventContext.run(actor, () => {
      expect(EventContext.getActor()).toEqual(actor);
    });
  });

  it('returns undefined after run() completes', () => {
    const actor: EventActor = { id: 'u-1', type: 'user' };

    EventContext.run(actor, () => {
      // inside
    });

    expect(EventContext.getActor()).toBeUndefined();
  });

  it('nested run() overrides the actor', () => {
    const outer: EventActor = { id: 'u-1', type: 'user', label: 'Outer' };
    const inner: EventActor = {
      id: 'sys-1',
      type: 'system',
      label: 'Inner',
    };

    EventContext.run(outer, () => {
      expect(EventContext.getActor()).toEqual(outer);

      EventContext.run(inner, () => {
        expect(EventContext.getActor()).toEqual(inner);
      });

      // Outer is restored after inner completes
      expect(EventContext.getActor()).toEqual(outer);
    });
  });

  it('returns the value from the wrapped function', () => {
    const actor: EventActor = { id: 'u-1', type: 'user' };
    const result = EventContext.run(actor, () => 42);
    expect(result).toBe(42);
  });
});

describe('DomainEvent + EventContext integration', () => {
  it('auto-picks up actor from EventContext when none provided', () => {
    const actor: EventActor = { id: 'u-1', type: 'user', label: 'Auto' };

    EventContext.run(actor, () => {
      const event = new DomainEvent('sally.load.created', 'tenant-1', {
        loadId: 'LD-1',
      });
      expect(event.actor).toEqual(actor);
    });
  });

  it('uses explicitly provided actor over context actor', () => {
    const contextActor: EventActor = { id: 'u-1', type: 'user' };
    const explicitActor: EventActor = {
      id: 'sys-1',
      type: 'system',
      label: 'Cron',
    };

    EventContext.run(contextActor, () => {
      const event = new DomainEvent('sally.load.created', 'tenant-1', { loadId: 'LD-1' }, explicitActor);
      expect(event.actor).toEqual(explicitActor);
    });
  });

  it('actor is undefined when no context and none provided', () => {
    const event = new DomainEvent('sally.load.created', 'tenant-1', {
      loadId: 'LD-1',
    });
    expect(event.actor).toBeUndefined();
  });
});
