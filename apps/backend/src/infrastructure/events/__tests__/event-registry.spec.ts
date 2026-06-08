import { EVENT_REGISTRY, getEventDefinition, getExternalEvents, getExternalEventsByCategory } from '../event-registry';
import { SALLY_EVENTS } from '../sally-events.constants';

describe('EventRegistry', () => {
  it('every registry entry has required fields', () => {
    for (const def of EVENT_REGISTRY) {
      expect(def.key).toMatch(/^sally\.[\w-]+\.[\w-]+$/);
      expect(def.constantName).toBeTruthy();
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(['external', 'internal']).toContain(def.visibility);
      expect(def.aggregateType).toBeTruthy();
    }
  });

  it('getEventDefinition returns correct definition', () => {
    const def = getEventDefinition('sally.load.created');
    expect(def).toBeDefined();
    expect(def.constantName).toBe('LOAD_CREATED');
    expect(def.visibility).toBe('external');
    expect(def.category).toBe('Load');
  });

  it('getEventDefinition returns undefined for unknown events', () => {
    expect(getEventDefinition('sally.unknown.event')).toBeUndefined();
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
        expect(event.name).toMatch(/^sally\./);
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

  it('SALLY_EVENTS backward compat — all existing constants preserved', () => {
    expect(SALLY_EVENTS.LOAD_CREATED).toBe('sally.load.created');
    expect(SALLY_EVENTS.LOAD_STATUS_CHANGED).toBe('sally.load.status-changed');
    expect(SALLY_EVENTS.ALERT_FIRED).toBe('sally.alert.fired');
    expect(SALLY_EVENTS.TRIP_CREATED).toBe('sally.trip.created');
    expect(SALLY_EVENTS.TRAILER_CREATED).toBe('sally.trailer.created');
    expect(SALLY_EVENTS.INVOICE_SENT).toBe('sally.invoice.sent');
    expect(SALLY_EVENTS.SYNC_STARTED).toBe('sally.sync.started');
    expect(SALLY_EVENTS.EDI_TENDER_RECEIVED).toBe('sally.edi.tender-received');
    expect(SALLY_EVENTS.EMAIL_INGEST_RECEIVED).toBe('sally.email-ingest.received');
  });

  it('SALLY_EVENTS has literal string types (not widened)', () => {
    const loadCreated: 'sally.load.created' = SALLY_EVENTS.LOAD_CREATED;
    expect(loadCreated).toBe('sally.load.created');
  });

  it('SALLY_EVENTS includes new events from overhaul', () => {
    expect(SALLY_EVENTS.DRIVER_CREATED).toBe('sally.driver.created');
    expect(SALLY_EVENTS.VEHICLE_CREATED).toBe('sally.vehicle.created');
    expect(SALLY_EVENTS.CUSTOMER_CREATED).toBe('sally.customer.created');
    expect(SALLY_EVENTS.INVOICE_CREATED).toBe('sally.invoice.created');
    expect(SALLY_EVENTS.SETTLEMENT_CREATED).toBe('sally.settlement.created');
    expect(SALLY_EVENTS.DOCUMENT_UPLOADED).toBe('sally.document.uploaded');
    expect(SALLY_EVENTS.CLOSEOUT_COMPLETED).toBe('sally.closeout.completed');
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
      'sally.preferences.updated',
      'sally.feature-flag.toggled',
      'sally.trip.route-stale',
      'sally.sync.started',
      'sally.sync.completed',
      'sally.sync.failed',
      'sally.telematics.updated',
      'sally.alert.unsnoozed',
      'sally.user.created',
      'sally.user.invited',
      'sally.user.deactivated',
      'sally.notification.sent',
    ];

    for (const key of internalKeys) {
      const def = getEventDefinition(key);
      expect(def).toBeDefined();
      expect(def.visibility).toBe('internal');
    }
  });
});
