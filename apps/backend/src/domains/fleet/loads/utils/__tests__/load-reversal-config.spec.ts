import {
  getReversalDefinition,
  isReversalTransition,
  REVERSAL_DEFINITIONS,
  REVERSAL_TIME_WINDOW_DAYS,
  REVERSAL_ESCALATION_ROLE,
  type ReversalDefinition,
} from '../load-reversal-config';

describe('Load Reversal Config', () => {
  describe('constants', () => {
    it('should have a 7-day time window', () => {
      expect(REVERSAL_TIME_WINDOW_DAYS).toBe(7);
    });

    it('should use ADMIN as escalation role', () => {
      expect(REVERSAL_ESCALATION_ROLE).toBe('ADMIN');
    });
  });

  describe('REVERSAL_DEFINITIONS', () => {
    it('should define exactly 4 reversals', () => {
      expect(Object.keys(REVERSAL_DEFINITIONS)).toHaveLength(4);
    });

    it.each(Object.values(REVERSAL_DEFINITIONS))(
      'should have all required fields for $from→$to',
      (def: ReversalDefinition) => {
        expect(def).toHaveProperty('from');
        expect(def).toHaveProperty('to');
        expect(def).toHaveProperty('defaultRole');
        expect(def).toHaveProperty('billingBlockers');
        expect(def).toHaveProperty('cascades');
        expect(def).toHaveProperty('clearFields');
        expect(Array.isArray(def.billingBlockers)).toBe(true);
        expect(Array.isArray(def.cascades)).toBe(true);
        expect(Array.isArray(def.clearFields)).toBe(true);
      },
    );
  });

  describe('getReversalDefinition', () => {
    it('should return definition for in_transit→assigned', () => {
      const def = getReversalDefinition('IN_TRANSIT', 'ASSIGNED');
      expect(def).toBeDefined();
      expect(def.from).toBe('IN_TRANSIT');
      expect(def.to).toBe('ASSIGNED');
      expect(def.defaultRole).toBe('DISPATCHER');
      expect(def.timeWindowDays).toBeNull();
      expect(def.cascades).toContain('reset_active_stops');
      expect(def.clearFields).toContain('inTransitAt');
    });

    it('should return definition for delivered→in_transit', () => {
      const def = getReversalDefinition('DELIVERED', 'IN_TRANSIT');
      expect(def).toBeDefined();
      expect(def.from).toBe('DELIVERED');
      expect(def.to).toBe('IN_TRANSIT');
      expect(def.billingBlockers).toContain('INVOICE_SENT');
      expect(def.billingBlockers).toContain('INVOICE_PAID');
      expect(def.cascades).toContain('void_draft_invoice');
      expect(def.clearFields).toContain('deliveredAt');
    });

    it('should return definition for cancelled→pending', () => {
      const def = getReversalDefinition('CANCELLED', 'PENDING');
      expect(def).toBeDefined();
      expect(def.from).toBe('CANCELLED');
      expect(def.to).toBe('PENDING');
      expect(def.timeWindowDays).toBe(REVERSAL_TIME_WINDOW_DAYS);
      expect(def.escalatedRole).toBe('ADMIN');
      expect(def.clearFields).toContain('cancelledAt');
      expect(def.clearFields).toContain('driverId');
    });

    it('should return definition for tonu→pending', () => {
      const def = getReversalDefinition('TONU', 'PENDING');
      expect(def).toBeDefined();
      expect(def.from).toBe('TONU');
      expect(def.to).toBe('PENDING');
      expect(def.timeWindowDays).toBe(REVERSAL_TIME_WINDOW_DAYS);
      expect(def.billingBlockers).toContain('TONU_INVOICE_SENT');
      expect(def.billingBlockers).toContain('TONU_INVOICE_PAID');
      expect(def.clearFields).toContain('tonuAt');
    });

    it('should return undefined for invalid reversal draft→delivered', () => {
      expect(getReversalDefinition('DRAFT', 'DELIVERED')).toBeUndefined();
    });

    it('should return undefined for invalid reversal pending→delivered', () => {
      expect(getReversalDefinition('PENDING', 'DELIVERED')).toBeUndefined();
    });

    it('should return undefined for forward transition draft→pending', () => {
      expect(getReversalDefinition('DRAFT', 'PENDING')).toBeUndefined();
    });

    it('should return undefined for forward transition assigned→in_transit', () => {
      expect(getReversalDefinition('ASSIGNED', 'IN_TRANSIT')).toBeUndefined();
    });
  });

  describe('isReversalTransition', () => {
    it('should return true for in_transit→assigned', () => {
      expect(isReversalTransition('IN_TRANSIT', 'ASSIGNED')).toBe(true);
    });

    it('should return true for delivered→in_transit', () => {
      expect(isReversalTransition('DELIVERED', 'IN_TRANSIT')).toBe(true);
    });

    it('should return true for cancelled→pending', () => {
      expect(isReversalTransition('CANCELLED', 'PENDING')).toBe(true);
    });

    it('should return true for tonu→pending', () => {
      expect(isReversalTransition('TONU', 'PENDING')).toBe(true);
    });

    it('should return false for forward transitions', () => {
      expect(isReversalTransition('DRAFT', 'PENDING')).toBe(false);
      expect(isReversalTransition('PENDING', 'ASSIGNED')).toBe(false);
      expect(isReversalTransition('ASSIGNED', 'IN_TRANSIT')).toBe(false);
      expect(isReversalTransition('IN_TRANSIT', 'DELIVERED')).toBe(false);
    });

    it('should return false for invalid transitions', () => {
      expect(isReversalTransition('DRAFT', 'DELIVERED')).toBe(false);
      expect(isReversalTransition('PENDING', 'DELIVERED')).toBe(false);
    });
  });
});
