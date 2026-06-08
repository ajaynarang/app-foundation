import { EVENT_REGISTRY, getEventDefinition, getExternalEvents, getExternalEventsByCategory } from '../event-registry';
import { DOMAIN_EVENTS } from '../sally-events.constants';

describe('EventRegistry', () => {
  it('every registry entry has required fields', () => {
    for (const def of EVENT_REGISTRY) {
      expect(def.key).toMatch(/^app\.[\w-]+\.[\w-]+$/);
      expect(def.constantName).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(['external', 'internal']).toContain(def.visibility);
      expect(def.aggregateType).toBeTruthy();
    }
  });

  it('getEventDefinition returns correct definition', () => {
    const def = getEventDefinition('app.notification.created');
    expect(def).toBeDefined();
    expect(def!.constantName).toBe('NOTIFICATION_CREATED');
    expect(def!.visibility).toBe('external');
    expect(def!.category).toBe('Notifications');
  });

  it('getEventDefinition returns undefined for unknown events', () => {
    expect(getEventDefinition('app.unknown.event')).toBeUndefined();
  });

  it('getExternalEvents excludes internal events', () => {
    const external = getExternalEvents();
    const internalKeys = EVENT_REGISTRY.filter((e) => e.visibility === 'internal').map((e) => e.key);

    for (const key of internalKeys) {
      expect(external.find((e) => e.key === key)).toBeUndefined();
    }
    expect(external.length).toBeGreaterThan(0);
    expect(external.length).toBeLessThan(EVENT_REGISTRY.length);
  });

  it('getExternalEventsByCategory groups correctly', () => {
    const categories = getExternalEventsByCategory();
    expect(categories.length).toBeGreaterThan(0);

    for (const cat of categories) {
      expect(cat.label).toBeTruthy();
      expect(cat.events.length).toBeGreaterThan(0);
      for (const event of cat.events) {
        expect(event.name).toMatch(/^app\./);
        expect(event.label).toBeTruthy();
        expect(event.description).toBeTruthy();
      }
    }
  });

  it('getExternalEventsByCategory excludes internal events', () => {
    const categories = getExternalEventsByCategory();
    const allExternalNames = categories.flatMap((c) => c.events.map((e) => e.name));
    const internalKeys = EVENT_REGISTRY.filter((e) => e.visibility === 'internal').map((e) => e.key);

    for (const key of internalKeys) {
      expect(allExternalNames).not.toContain(key);
    }
  });

  it('DOMAIN_EVENTS exposes the generic platform catalog', () => {
    expect(DOMAIN_EVENTS.NOTIFICATION_CREATED).toBe('app.notification.created');
    expect(DOMAIN_EVENTS.USER_INVITED).toBe('app.user.invited');
    expect(DOMAIN_EVENTS.TENANT_UPDATED).toBe('app.tenant.updated');
    expect(DOMAIN_EVENTS.INTEGRATION_SYNCED).toBe('app.integration.synced');
    expect(DOMAIN_EVENTS.AI_MESSAGE).toBe('app.ai.message');
  });

  it('DOMAIN_EVENTS has literal string types (not widened)', () => {
    const notificationCreated: 'app.notification.created' = DOMAIN_EVENTS.NOTIFICATION_CREATED;
    expect(notificationCreated).toBe('app.notification.created');
  });

  it('no duplicate keys in registry', () => {
    const keys = EVENT_REGISTRY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('no duplicate constantNames in registry', () => {
    const names = EVENT_REGISTRY.map((e) => e.constantName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('internal events are classified correctly', () => {
    const internalKeys = [
      'app.preferences.updated',
      'app.feature-flag.toggled',
      'app.sync.started',
      'app.sync.completed',
      'app.sync.failed',
      'app.user.created',
      'app.user.deactivated',
      'app.notification.sent',
    ];

    for (const key of internalKeys) {
      const def = getEventDefinition(key);
      expect(def).toBeDefined();
      expect(def!.visibility).toBe('internal');
    }
  });
});
