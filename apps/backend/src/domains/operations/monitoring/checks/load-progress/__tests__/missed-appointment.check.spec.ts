import { MissedAppointmentCheck } from '../missed-appointment.check';

describe('MissedAppointmentCheck', () => {
  let check: MissedAppointmentCheck;

  beforeEach(() => {
    check = new MissedAppointmentCheck();
  });

  const baseContext = {
    load: { loadNumber: 'LD-001', loadStops: [] },
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    activePlan: null,
    nextPendingStop: null,
    estimatedDriveMinutes: null,
  };

  it('should return null when no nextPendingStop', () => {
    const result = check.run(baseContext as any, {});
    expect(result).toBeNull();
  });

  it('should return null when no appointment info', () => {
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        latestArrival: null,
        appointmentDate: null,
        status: 'pending',
        stop: { name: 'Stop A' },
        actionType: 'delivery',
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should return null when stop is completed', () => {
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        latestArrival: '10:00',
        appointmentDate: new Date('2020-01-01'),
        status: 'COMPLETED',
        stop: { name: 'Stop A' },
        actionType: 'delivery',
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger when appointment time has passed', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        latestArrival: '10:00',
        appointmentDate: yesterday,
        status: 'pending',
        stop: { name: 'Warehouse A' },
        actionType: 'delivery',
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.type).toBe('MISSED_APPOINTMENT');
    expect(result.severity).toBe('critical');
    expect(result.requiresReplan).toBe(true);
    expect(result.params.stopName).toBe('Warehouse A');
    expect(result.params.actionType).toBe('delivery');
  });

  it('should not trigger when appointment is in the future', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ctx = {
      ...baseContext,
      nextPendingStop: {
        latestArrival: '23:59',
        appointmentDate: tomorrow,
        status: 'pending',
        stop: { name: 'Stop A' },
        actionType: 'pickup',
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });
});
