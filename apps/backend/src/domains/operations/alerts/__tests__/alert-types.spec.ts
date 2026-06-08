import { AlertPriority } from '@prisma/client';

import { ALERT_TYPES, AlertTypeDefinition } from '../alert-types';

describe('ALERT_TYPES', () => {
  const allTypes = Object.keys(ALERT_TYPES);

  it('should define all expected alert types', () => {
    expect(allTypes.length).toBeGreaterThanOrEqual(20);
    expect(allTypes).toContain('HOS_VIOLATION');
    expect(allTypes).toContain('APPOINTMENT_AT_RISK');
    expect(allTypes).toContain('DRIVER_NOT_MOVING');
    expect(allTypes).toContain('FUEL_LOW');
    expect(allTypes).toContain('PLAN_MISSED_STOP');
  });

  it.each(allTypes)('alert type %s should have all required fields', (type) => {
    const def: AlertTypeDefinition = ALERT_TYPES[type];
    expect(def.type).toBe(type);
    expect(typeof def.category).toBe('string');
    expect(typeof def.defaultPriority).toBe('string');
    expect(typeof def.title).toBe('function');
    expect(typeof def.message).toBe('function');
    expect(typeof def.recommendedAction).toBe('function');
  });

  it.each(allTypes)('alert type %s title/message/action should return strings', (type) => {
    const def = ALERT_TYPES[type];
    const params = { driverId: 'DRV-1', driverName: 'John' };
    expect(typeof def.title(params)).toBe('string');
    expect(typeof def.message(params)).toBe('string');
    expect(typeof def.recommendedAction(params)).toBe('string');
  });

  describe('HOS_VIOLATION', () => {
    it('should format title with driver name', () => {
      const title = ALERT_TYPES.HOS_VIOLATION.title({ driverName: 'John' });
      expect(title).toContain('John');
    });

    it('should fall back to driverId', () => {
      const title = ALERT_TYPES.HOS_VIOLATION.title({ driverId: 'DRV-1' });
      expect(title).toContain('DRV-1');
    });

    it('should be critical priority', () => {
      expect(ALERT_TYPES.HOS_VIOLATION.defaultPriority).toBe(AlertPriority.CRITICAL);
    });
  });

  describe('APPOINTMENT_AT_RISK', () => {
    it('should include stop name in title', () => {
      const title = ALERT_TYPES.APPOINTMENT_AT_RISK.title({
        stopName: 'Warehouse A',
      });
      expect(title).toContain('Warehouse A');
    });

    it('should include ETA delay in message', () => {
      const msg = ALERT_TYPES.APPOINTMENT_AT_RISK.message({
        etaDelay: 15,
        stopName: 'Dock B',
      });
      expect(msg).toContain('15');
    });

    it('should have auto-resolve condition', () => {
      expect(ALERT_TYPES.APPOINTMENT_AT_RISK.autoResolveCondition).toBeDefined();
    });
  });

  describe('categories', () => {
    it('should have compliance, schedule, safety, and route categories', () => {
      const categories = new Set(allTypes.map((t) => ALERT_TYPES[t].category));
      expect(categories).toContain('compliance');
      expect(categories).toContain('schedule');
      expect(categories).toContain('safety');
      expect(categories).toContain('route');
    });
  });

  describe('PLAN_MISSED_STOP', () => {
    it('should recommend fuel stop context in action', () => {
      const action = ALERT_TYPES.PLAN_MISSED_STOP.recommendedAction({
        segmentType: 'fuel',
      });
      expect(action).toContain('fuel stop');
    });

    it('should recommend rest stop context in action', () => {
      const action = ALERT_TYPES.PLAN_MISSED_STOP.recommendedAction({
        segmentType: 'rest',
      });
      expect(action).toContain('rest stop');
    });
  });
});
