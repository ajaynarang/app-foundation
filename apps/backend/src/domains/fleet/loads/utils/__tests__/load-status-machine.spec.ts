import { VALID_LOAD_STATUSES, validateLoadTransition, getTimestampFieldForStatus } from '../load-status-machine';

describe('Load Status Machine', () => {
  describe('VALID_LOAD_STATUSES', () => {
    it('should include all 9 statuses', () => {
      expect(VALID_LOAD_STATUSES).toEqual([
        'TENDER',
        'DRAFT',
        'PENDING',
        'ASSIGNED',
        'IN_TRANSIT',
        'ON_HOLD',
        'DELIVERED',
        'CANCELLED',
        'TONU',
      ]);
    });
  });

  describe('validateLoadTransition', () => {
    it('should allow draft → pending', () => {
      expect(() => validateLoadTransition('DRAFT', 'PENDING')).not.toThrow();
    });
    it('should allow draft → cancelled', () => {
      expect(() => validateLoadTransition('DRAFT', 'CANCELLED')).not.toThrow();
    });
    it('should allow pending → assigned', () => {
      expect(() => validateLoadTransition('PENDING', 'ASSIGNED')).not.toThrow();
    });
    it('should allow pending → on_hold', () => {
      expect(() => validateLoadTransition('PENDING', 'ON_HOLD')).not.toThrow();
    });
    it('should allow assigned → in_transit', () => {
      expect(() => validateLoadTransition('ASSIGNED', 'IN_TRANSIT')).not.toThrow();
    });
    it('should allow assigned → tonu', () => {
      expect(() => validateLoadTransition('ASSIGNED', 'TONU')).not.toThrow();
    });
    it('should allow in_transit → delivered', () => {
      expect(() => validateLoadTransition('IN_TRANSIT', 'DELIVERED')).not.toThrow();
    });
    it('should allow in_transit → on_hold', () => {
      expect(() => validateLoadTransition('IN_TRANSIT', 'ON_HOLD')).not.toThrow();
    });
    it('should allow in_transit → assigned (reversal)', () => {
      expect(() => validateLoadTransition('IN_TRANSIT', 'ASSIGNED')).not.toThrow();
    });
    it('should allow on_hold → pending (resume)', () => {
      expect(() => validateLoadTransition('ON_HOLD', 'PENDING')).not.toThrow();
    });
    it('should allow on_hold → assigned (resume)', () => {
      expect(() => validateLoadTransition('ON_HOLD', 'ASSIGNED')).not.toThrow();
    });
    it('should allow on_hold → in_transit (resume)', () => {
      expect(() => validateLoadTransition('ON_HOLD', 'IN_TRANSIT')).not.toThrow();
    });
    it('should allow pending → draft (demotion)', () => {
      expect(() => validateLoadTransition('PENDING', 'DRAFT')).not.toThrow();
    });
    it('should allow assigned → pending (demotion)', () => {
      expect(() => validateLoadTransition('ASSIGNED', 'PENDING')).not.toThrow();
    });
    it('should allow on_hold → draft (demotion)', () => {
      expect(() => validateLoadTransition('ON_HOLD', 'DRAFT')).not.toThrow();
    });

    it('should reject draft → delivered', () => {
      expect(() => validateLoadTransition('DRAFT', 'DELIVERED')).toThrow();
    });
    it('should reject draft → in_transit', () => {
      expect(() => validateLoadTransition('DRAFT', 'IN_TRANSIT')).toThrow();
    });
    it('should reject pending → delivered', () => {
      expect(() => validateLoadTransition('PENDING', 'DELIVERED')).toThrow();
    });
    it('should reject pending → in_transit', () => {
      expect(() => validateLoadTransition('PENDING', 'IN_TRANSIT')).toThrow();
    });
    it('should allow delivered → in_transit (reversal)', () => {
      expect(() => validateLoadTransition('DELIVERED', 'IN_TRANSIT')).not.toThrow();
    });
    it('should reject delivered → non-reversal targets', () => {
      expect(() => validateLoadTransition('DELIVERED', 'PENDING')).toThrow();
      expect(() => validateLoadTransition('DELIVERED', 'CANCELLED')).toThrow();
      expect(() => validateLoadTransition('DELIVERED', 'ASSIGNED')).toThrow();
    });
    it('should allow cancelled → pending (reversal)', () => {
      expect(() => validateLoadTransition('CANCELLED', 'PENDING')).not.toThrow();
    });
    it('should reject cancelled → non-reversal targets', () => {
      expect(() => validateLoadTransition('CANCELLED', 'ASSIGNED')).toThrow();
      expect(() => validateLoadTransition('CANCELLED', 'IN_TRANSIT')).toThrow();
    });
    it('should allow tonu → pending (reversal)', () => {
      expect(() => validateLoadTransition('TONU', 'PENDING')).not.toThrow();
    });
    it('should reject tonu → non-reversal targets', () => {
      expect(() => validateLoadTransition('TONU', 'ASSIGNED')).toThrow();
      expect(() => validateLoadTransition('TONU', 'IN_TRANSIT')).toThrow();
    });
    it('should reject invalid status', () => {
      expect(() => validateLoadTransition('DRAFT', 'invalid')).toThrow();
    });

    // Tender status transitions
    it('should allow tender → pending (accept)', () => {
      expect(() => validateLoadTransition('TENDER', 'PENDING')).not.toThrow();
    });

    it('should allow tender → cancelled (decline)', () => {
      expect(() => validateLoadTransition('TENDER', 'CANCELLED')).not.toThrow();
    });

    it('should reject tender → assigned', () => {
      expect(() => validateLoadTransition('TENDER', 'ASSIGNED')).toThrow();
    });

    it('should reject tender → in_transit', () => {
      expect(() => validateLoadTransition('TENDER', 'IN_TRANSIT')).toThrow();
    });

    it('should reject tender → delivered', () => {
      expect(() => validateLoadTransition('TENDER', 'DELIVERED')).toThrow();
    });
  });

  describe('getTimestampFieldForStatus', () => {
    it('should return assignedAt for assigned', () => {
      expect(getTimestampFieldForStatus('ASSIGNED')).toBe('assignedAt');
    });
    it('should return inTransitAt for in_transit', () => {
      expect(getTimestampFieldForStatus('IN_TRANSIT')).toBe('inTransitAt');
    });
    it('should return deliveredAt for delivered', () => {
      expect(getTimestampFieldForStatus('DELIVERED')).toBe('deliveredAt');
    });
    it('should return cancelledAt for cancelled', () => {
      expect(getTimestampFieldForStatus('CANCELLED')).toBe('cancelledAt');
    });
    it('should return onHoldAt for on_hold', () => {
      expect(getTimestampFieldForStatus('ON_HOLD')).toBe('onHoldAt');
    });
    it('should return tonuAt for tonu', () => {
      expect(getTimestampFieldForStatus('TONU')).toBe('tonuAt');
    });
    it('should return null for statuses without timestamps', () => {
      expect(getTimestampFieldForStatus('DRAFT')).toBeNull();
      expect(getTimestampFieldForStatus('PENDING')).toBeNull();
    });
    it('should return null timestamp for tender status', () => {
      expect(getTimestampFieldForStatus('TENDER')).toBeNull();
    });
  });
});
