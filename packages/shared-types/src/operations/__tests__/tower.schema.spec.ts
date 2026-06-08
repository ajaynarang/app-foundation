import {
  ActiveLoadHosSchema,
  ActiveLoadViewSchema,
  LookaheadHoursSchema,
  RiskBandSchema,
  RiskScoreSchema,
  WireItemSchema,
  WireKindSchema,
} from '../tower.schema';

describe('Tower schemas', () => {
  describe('RiskBandSchema', () => {
    it('accepts the three risk bands', () => {
      expect(RiskBandSchema.parse('on-track')).toBe('on-track');
      expect(RiskBandSchema.parse('at-risk')).toBe('at-risk');
      expect(RiskBandSchema.parse('critical')).toBe('critical');
    });

    it('rejects other strings', () => {
      expect(() => RiskBandSchema.parse('danger')).toThrow();
    });
  });

  describe('LookaheadHoursSchema', () => {
    it('accepts 2 / 4 / 8 and the literal shift', () => {
      expect(LookaheadHoursSchema.parse(2)).toBe(2);
      expect(LookaheadHoursSchema.parse(4)).toBe(4);
      expect(LookaheadHoursSchema.parse(8)).toBe(8);
      expect(LookaheadHoursSchema.parse('shift')).toBe('shift');
    });

    it('rejects other numbers and strings', () => {
      expect(() => LookaheadHoursSchema.parse(6)).toThrow();
      expect(() => LookaheadHoursSchema.parse('today')).toThrow();
    });
  });

  describe('RiskScoreSchema', () => {
    it('round-trips a valid score', () => {
      const input = { loadId: 'L1', driverId: 'D1', score: 72, band: 'at-risk' as const };
      expect(RiskScoreSchema.parse(input)).toEqual(input);
    });

    it('rejects scores out of 0–100', () => {
      expect(() => RiskScoreSchema.parse({ loadId: 'L1', driverId: 'D1', score: 120, band: 'critical' })).toThrow();
      expect(() => RiskScoreSchema.parse({ loadId: 'L1', driverId: 'D1', score: -1, band: 'on-track' })).toThrow();
    });

    it('rejects non-integer scores', () => {
      expect(() => RiskScoreSchema.parse({ loadId: 'L1', driverId: 'D1', score: 50.5, band: 'on-track' })).toThrow();
    });
  });

  describe('WireKindSchema', () => {
    it('accepts the four wire kinds', () => {
      expect(WireKindSchema.parse('alert')).toBe('alert');
      expect(WireKindSchema.parse('message')).toBe('message');
      expect(WireKindSchema.parse('desk')).toBe('desk');
      expect(WireKindSchema.parse('ops')).toBe('ops');
    });
  });

  describe('WireItemSchema', () => {
    it('accepts a minimal valid item', () => {
      const item = {
        id: 'evt-1',
        kind: 'alert' as const,
        severity: 'critical' as const,
        text: 'T-07 HOS clash in 42 minutes',
        timestamp: '2026-05-15T18:00:00Z',
      };
      expect(WireItemSchema.parse(item)).toEqual(item);
    });

    it('accepts optional desk anchor + actions', () => {
      const item = {
        id: 'evt-2',
        kind: 'desk' as const,
        severity: 'info' as const,
        text: 'Backhaul found',
        timestamp: '2026-05-15T18:01:00Z',
        deskAnchor: { responsibilityType: 'backhaul-finder', episodeId: 'ep-1' },
        actions: [{ kind: 'accept-desk' as const, label: 'Yes, pre-stage' }],
      };
      expect(WireItemSchema.parse(item)).toEqual(item);
    });

    it('rejects missing required fields', () => {
      expect(() => WireItemSchema.parse({ id: 'x' })).toThrow();
    });
  });

  describe('ActiveLoadViewSchema', () => {
    it('round-trips a minimal valid view', () => {
      const view = {
        loadId: 'L1',
        loadNumber: 'LOAD-8821',
        referenceNumber: 'PO-4427',
        customerName: 'Cargill',
        driver: { driverId: 'D1', name: 'Carlos Mendoza', initials: 'CM' },
        vehicleIdentifier: 'T-14',
        currentStop: null,
        nextStop: null,
        etaAt: null,
        slackMinutes: null,
        assignmentState: 'rolling' as const,
        hos: null,
      };
      expect(ActiveLoadViewSchema.parse(view)).toEqual(view);
    });

    it('round-trips a view with a null reference number', () => {
      const view = {
        loadId: 'L1',
        loadNumber: 'LOAD-8821',
        referenceNumber: null,
        customerName: 'Cargill',
        driver: { driverId: 'D1', name: 'Carlos Mendoza', initials: 'CM' },
        vehicleIdentifier: 'T-14',
        currentStop: null,
        nextStop: null,
        etaAt: null,
        slackMinutes: null,
        assignmentState: 'rolling' as const,
        hos: null,
      };
      expect(ActiveLoadViewSchema.parse(view)).toEqual(view);
    });

    it('rejects a view missing the reference number field', () => {
      expect(() =>
        ActiveLoadViewSchema.parse({
          loadId: 'L1',
          loadNumber: 'LOAD-1',
          customerName: null,
          driver: { driverId: 'D1', name: 'X', initials: 'X' },
          vehicleIdentifier: null,
          currentStop: null,
          nextStop: null,
          etaAt: null,
          slackMinutes: null,
          assignmentState: 'rolling',
          hos: null,
        }),
      ).toThrow();
    });

    it('rejects unknown assignment state', () => {
      expect(() =>
        ActiveLoadViewSchema.parse({
          loadId: 'L1',
          loadNumber: 'LOAD-1',
          referenceNumber: null,
          customerName: null,
          driver: { driverId: 'D1', name: 'X', initials: 'X' },
          vehicleIdentifier: null,
          currentStop: null,
          nextStop: null,
          etaAt: null,
          slackMinutes: null,
          assignmentState: 'paused',
          hos: null,
        }),
      ).toThrow();
    });

    it('round-trips a view carrying all four HOS clocks', () => {
      const view = {
        loadId: 'L1',
        loadNumber: 'LOAD-8821',
        referenceNumber: 'PO-9001',
        customerName: 'Cargill',
        driver: { driverId: 'D1', name: 'Carlos Mendoza', initials: 'CM' },
        vehicleIdentifier: 'T-14',
        currentStop: null,
        nextStop: null,
        etaAt: null,
        slackMinutes: null,
        assignmentState: 'rolling' as const,
        hos: {
          driveMinutesRemaining: 120,
          dutyMinutesRemaining: 300,
          cycleMinutesRemaining: 2400,
          breakMinutesRemaining: 90,
          isEldConnected: true,
          lastSyncAt: '2026-05-15T11:55:00.000Z',
        },
      };
      expect(ActiveLoadViewSchema.parse(view)).toEqual(view);
    });

    it('accepts a null break clock (ELD not reporting it)', () => {
      const hos = {
        driveMinutesRemaining: 360,
        dutyMinutesRemaining: 0,
        cycleMinutesRemaining: 0,
        breakMinutesRemaining: null,
        isEldConnected: false,
        lastSyncAt: null,
      };
      expect(ActiveLoadHosSchema.parse(hos)).toEqual(hos);
    });

    it('rejects an HOS snapshot missing the duty clock', () => {
      expect(() =>
        ActiveLoadHosSchema.parse({
          driveMinutesRemaining: 120,
          cycleMinutesRemaining: 2400,
          breakMinutesRemaining: 90,
          isEldConnected: true,
          lastSyncAt: null,
        }),
      ).toThrow();
    });
  });
});
