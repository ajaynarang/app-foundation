import { OffPaceCheck } from '../off-pace.check';

describe('OffPaceCheck', () => {
  let check: OffPaceCheck;

  beforeEach(() => {
    check = new OffPaceCheck();
  });

  const baseContext = {
    load: { loadNumber: 'LD-001', loadStops: [] },
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    activePlan: null,
    nextPendingStop: null,
    estimatedDriveMinutes: null,
    gpsData: null,
    hosData: null,
  };

  describe('plan-aware pace check', () => {
    it('should trigger when actual progress < 70% of expected', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const ctx = {
        ...baseContext,
        activePlan: {
          planId: 'PLN-001',
          currentSegment: {
            segmentId: 'SEG-001',
            segmentType: 'drive',
            estimatedDeparture: oneHourAgo.toISOString(),
            driveTimeHours: 2,
            progress: 0.1, // 10% actual vs ~50% expected
          },
        },
      };

      const result = check.run(ctx as any, {});

      expect(result).not.toBeNull();
      expect(result.type).toBe('OFF_PACE');
      expect(result.params.planAware).toBe(true);
      expect(result.params.deficitPercent).toBeGreaterThan(0);
    });

    it('should return null when on pace', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const ctx = {
        ...baseContext,
        activePlan: {
          planId: 'PLN-001',
          currentSegment: {
            segmentId: 'SEG-001',
            segmentType: 'drive',
            estimatedDeparture: oneHourAgo.toISOString(),
            driveTimeHours: 2,
            progress: 0.5, // 50% actual vs ~50% expected
          },
        },
      };

      const result = check.run(ctx as any, {});
      expect(result).toBeNull();
    });

    it('should skip when expected progress < 10%', () => {
      const justStarted = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      const ctx = {
        ...baseContext,
        activePlan: {
          planId: 'PLN-001',
          currentSegment: {
            segmentId: 'SEG-001',
            segmentType: 'drive',
            estimatedDeparture: justStarted.toISOString(),
            driveTimeHours: 5, // very long segment, just started
            progress: 0,
          },
        },
      };

      const result = check.run(ctx as any, {});
      expect(result).toBeNull();
    });

    it('should skip basic check when plan-aware check passes', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const ctx = {
        ...baseContext,
        activePlan: {
          planId: 'PLN-001',
          currentSegment: {
            segmentId: 'SEG-001',
            segmentType: 'drive',
            estimatedDeparture: oneHourAgo.toISOString(),
            driveTimeHours: 2,
            progress: 0.45,
          },
        },
        // Even though basic would trigger, plan-aware returns null first
        nextPendingStop: {
          stop: { name: 'Stop A' },
          latestArrival: '12:00',
          appointmentDate: new Date(),
        },
        estimatedDriveMinutes: 200,
      };

      const result = check.run(ctx as any, {});
      expect(result).toBeNull();
    });
  });

  describe('basic (non-plan) pace check', () => {
    it('should return null when no nextPendingStop', () => {
      const result = check.run(baseContext as any, {});
      expect(result).toBeNull();
    });

    it('should return null when no appointment time', () => {
      const ctx = {
        ...baseContext,
        nextPendingStop: {
          stop: { name: 'Stop A' },
          latestArrival: null,
          appointmentDate: null,
        },
        estimatedDriveMinutes: 60,
      };

      const result = check.run(ctx as any, {});
      expect(result).toBeNull();
    });

    it('should return null when estimatedDriveMinutes is null', () => {
      const ctx = {
        ...baseContext,
        nextPendingStop: {
          stop: { name: 'Stop A' },
          latestArrival: '14:00',
          appointmentDate: new Date(),
        },
        estimatedDriveMinutes: null,
      };

      const result = check.run(ctx as any, {});
      expect(result).toBeNull();
    });

    it('should trigger when driver cannot make appointment in time', () => {
      // Set appointment 60 min from now, but drive time is 90 min
      const appointmentDate = new Date();
      const futureHour = new Date(Date.now() + 60 * 60 * 1000);
      const timeStr = `${futureHour.getHours().toString().padStart(2, '0')}:${futureHour.getMinutes().toString().padStart(2, '0')}`;

      const ctx = {
        ...baseContext,
        nextPendingStop: {
          stop: { name: 'Warehouse A' },
          latestArrival: timeStr,
          appointmentDate,
        },
        estimatedDriveMinutes: 90, // 90 min drive, only 60 min available (minus 30 buffer)
      };

      const result = check.run(ctx as any, {});
      expect(result).not.toBeNull();
      expect(result.type).toBe('OFF_PACE');
      expect(result.params.stopName).toBe('Warehouse A');
    });

    it('should not trigger when drive time is within buffer', () => {
      // Set appointment 120 min from now, drive time 60 min, buffer 30
      const appointmentDate = new Date();
      const futureHour = new Date(Date.now() + 120 * 60 * 1000);
      const timeStr = `${futureHour.getHours().toString().padStart(2, '0')}:${futureHour.getMinutes().toString().padStart(2, '0')}`;

      const ctx = {
        ...baseContext,
        nextPendingStop: {
          stop: { name: 'Warehouse A' },
          latestArrival: timeStr,
          appointmentDate,
        },
        estimatedDriveMinutes: 60,
      };

      const result = check.run(ctx as any, {});
      expect(result).toBeNull();
    });
  });
});
