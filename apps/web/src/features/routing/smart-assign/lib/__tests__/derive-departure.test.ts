/* global describe, it, expect */
import { deriveDefaultDeparture } from '../derive-departure';

describe('deriveDefaultDeparture', () => {
  const NOW = new Date('2026-05-27T10:00:00.000Z');
  const ONE_HOUR_MS = 3600 * 1000;
  const FIVE_MIN_MS = 5 * 60 * 1000;

  describe('DERIVED — happy path', () => {
    it('subtracts deadhead + pre-trip + safety buffer from pickup', () => {
      // Pickup 4h from now, 100mi deadhead → 2h drive → buffer 0.5h → derived = pickup − 2.5h
      const pickup = new Date(NOW.getTime() + 4 * ONE_HOUR_MS);
      const result = deriveDefaultDeparture({
        firstPickupApptStart: pickup,
        driverDistanceMilesFromPickup: 100,
        now: NOW,
      });

      expect(result.source).toBe('DERIVED');
      expect(result.deadheadMinutes).toBe(120);
      expect(result.note).toMatch(/Suggested/);

      const derivedMs = new Date(result.isoTime).getTime();
      const expectedMs = pickup.getTime() - 2.5 * ONE_HOUR_MS;
      // Allow up to 5 min for floor-to-5min
      expect(Math.abs(derivedMs - expectedMs)).toBeLessThanOrEqual(FIVE_MIN_MS);
    });

    it('handles deadhead = 0 (driver at shipper) — derived = pickup − 30m buffer', () => {
      const pickup = new Date(NOW.getTime() + 4 * ONE_HOUR_MS);
      const result = deriveDefaultDeparture({
        firstPickupApptStart: pickup,
        driverDistanceMilesFromPickup: 0,
        now: NOW,
      });

      expect(result.source).toBe('DERIVED');
      expect(result.deadheadMinutes).toBe(0);
      expect(result.note).toMatch(/driver at pickup/i);

      const derivedMs = new Date(result.isoTime).getTime();
      const expectedMs = pickup.getTime() - 0.5 * ONE_HOUR_MS;
      expect(Math.abs(derivedMs - expectedMs)).toBeLessThanOrEqual(FIVE_MIN_MS);
    });

    it('floors the result to the nearest 5 minutes', () => {
      const pickup = new Date(NOW.getTime() + 4 * ONE_HOUR_MS);
      const result = deriveDefaultDeparture({
        firstPickupApptStart: pickup,
        driverDistanceMilesFromPickup: 37, // 37/50 = 0.74h deadhead → fractional minutes guaranteed
        now: NOW,
      });

      const derivedMs = new Date(result.isoTime).getTime();
      expect(derivedMs % FIVE_MIN_MS).toBe(0);
    });
  });

  describe('FALLBACK_PAST_APPT', () => {
    it('returns now + 1h when pickup is in the past', () => {
      const pastPickup = new Date(NOW.getTime() - ONE_HOUR_MS);
      const result = deriveDefaultDeparture({
        firstPickupApptStart: pastPickup,
        driverDistanceMilesFromPickup: 50,
        now: NOW,
      });

      expect(result.source).toBe('FALLBACK_PAST_APPT');
      expect(result.deadheadMinutes).toBe(0);
      expect(result.note).toMatch(/past/i);

      const expectedMs = NOW.getTime() + ONE_HOUR_MS;
      expect(new Date(result.isoTime).getTime()).toBe(expectedMs);
    });

    it('returns now + 1h when pickup is missing', () => {
      const result = deriveDefaultDeparture({
        firstPickupApptStart: null,
        driverDistanceMilesFromPickup: 50,
        now: NOW,
      });
      expect(result.source).toBe('FALLBACK_PAST_APPT');
    });

    it('returns now + 1h when pickup equals now (boundary)', () => {
      const result = deriveDefaultDeparture({
        firstPickupApptStart: NOW,
        driverDistanceMilesFromPickup: 50,
        now: NOW,
      });
      expect(result.source).toBe('FALLBACK_PAST_APPT');
    });
  });

  describe('FALLBACK_NO_LOCATION', () => {
    it('returns pickup − 1h when driver location is unknown', () => {
      const pickup = new Date(NOW.getTime() + 4 * ONE_HOUR_MS);
      const result = deriveDefaultDeparture({
        firstPickupApptStart: pickup,
        driverDistanceMilesFromPickup: null,
        now: NOW,
      });

      expect(result.source).toBe('FALLBACK_NO_LOCATION');
      expect(result.deadheadMinutes).toBe(60);
      expect(result.note).toMatch(/location unknown/i);

      const expectedMs = pickup.getTime() - ONE_HOUR_MS;
      expect(new Date(result.isoTime).getTime()).toBe(expectedMs);
    });

    it('treats undefined distance the same as null', () => {
      const pickup = new Date(NOW.getTime() + 4 * ONE_HOUR_MS);
      const result = deriveDefaultDeparture({
        firstPickupApptStart: pickup,
        driverDistanceMilesFromPickup: undefined,
        now: NOW,
      });
      expect(result.source).toBe('FALLBACK_NO_LOCATION');
    });
  });
});
