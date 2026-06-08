import { BadRequestException } from '@nestjs/common';
import { validateTripManualTransition, getTripTimestampField } from '../utils/trip-status-machine';

describe('trip-status-machine', () => {
  describe('validateTripManualTransition', () => {
    it('should allow DRAFT → ASSIGNED', () => {
      expect(() => validateTripManualTransition('DRAFT', 'ASSIGNED')).not.toThrow();
    });

    it('should allow DRAFT → CANCELLED', () => {
      expect(() => validateTripManualTransition('DRAFT', 'CANCELLED')).not.toThrow();
    });

    it('should allow ASSIGNED → CANCELLED', () => {
      expect(() => validateTripManualTransition('ASSIGNED', 'CANCELLED')).not.toThrow();
    });

    it('should reject DRAFT → IN_PROGRESS', () => {
      expect(() => validateTripManualTransition('DRAFT', 'IN_PROGRESS')).toThrow(BadRequestException);
    });

    it('should reject DRAFT → COMPLETED', () => {
      expect(() => validateTripManualTransition('DRAFT', 'COMPLETED')).toThrow(BadRequestException);
    });

    it('should reject IN_PROGRESS → CANCELLED (must cancel individual loads)', () => {
      expect(() => validateTripManualTransition('IN_PROGRESS', 'CANCELLED')).toThrow('Cancel individual loads');
    });

    it('should reject COMPLETED → any (terminal state)', () => {
      expect(() => validateTripManualTransition('COMPLETED', 'DRAFT')).toThrow('terminal state');
    });

    it('should reject CANCELLED → any (terminal state)', () => {
      expect(() => validateTripManualTransition('CANCELLED', 'DRAFT')).toThrow('terminal state');
    });

    it('should reject ASSIGNED → DRAFT', () => {
      expect(() => validateTripManualTransition('ASSIGNED', 'DRAFT')).toThrow(BadRequestException);
    });
  });

  describe('getTripTimestampField', () => {
    it('should return null for DRAFT', () => {
      expect(getTripTimestampField('DRAFT')).toBeNull();
    });

    it('should return assignedAt for ASSIGNED', () => {
      expect(getTripTimestampField('ASSIGNED')).toBe('assignedAt');
    });

    it('should return startedAt for IN_PROGRESS', () => {
      expect(getTripTimestampField('IN_PROGRESS')).toBe('startedAt');
    });

    it('should return completedAt for COMPLETED', () => {
      expect(getTripTimestampField('COMPLETED')).toBe('completedAt');
    });

    it('should return cancelledAt for CANCELLED', () => {
      expect(getTripTimestampField('CANCELLED')).toBe('cancelledAt');
    });

    it('should return null for unknown status', () => {
      expect(getTripTimestampField('unknown')).toBeNull();
    });
  });
});
