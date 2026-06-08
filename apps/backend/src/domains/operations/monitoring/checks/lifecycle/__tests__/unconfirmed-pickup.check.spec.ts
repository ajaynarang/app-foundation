import { UnconfirmedPickupCheck } from '../unconfirmed-pickup.check';

describe('UnconfirmedPickupCheck', () => {
  let check: UnconfirmedPickupCheck;

  beforeEach(() => {
    check = new UnconfirmedPickupCheck();
  });

  const baseContext = {
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    activePlan: null,
    nextPendingStop: null,
    estimatedDriveMinutes: null,
  };

  it('should return null when no pickup stops', () => {
    const ctx = { ...baseContext, load: { loadNumber: 'LD-001', loadStops: [] } };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should skip completed pickup stops', () => {
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'pickup',
            status: 'COMPLETED',
            sequenceOrder: 1,
            appointmentDate: new Date('2020-01-01'),
            latestArrival: '10:00',
            estimatedDockHours: 1,
            stop: { name: 'Warehouse' },
          },
        ],
      },
    };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger when pickup expected completion has passed', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'pickup',
            status: 'PENDING',
            sequenceOrder: 1,
            appointmentDate: yesterday,
            latestArrival: '10:00',
            estimatedDockHours: 1,
            stop: { name: 'Pickup Warehouse' },
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.type).toBe('UNCONFIRMED_PICKUP');
    expect(result.severity).toBe('medium');
    expect(result.params.actionType).toBe('pickup');
    expect(result.params.stopName).toBe('Pickup Warehouse');
  });

  it('should not trigger when expected completion is in the future', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'pickup',
            status: 'PENDING',
            sequenceOrder: 1,
            appointmentDate: tomorrow,
            latestArrival: '23:00',
            estimatedDockHours: 1,
            stop: { name: 'Warehouse' },
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should skip stops without appointment data', () => {
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'pickup',
            status: 'PENDING',
            sequenceOrder: 1,
            appointmentDate: null,
            latestArrival: null,
            estimatedDockHours: 1,
            stop: { name: 'Warehouse' },
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should only trigger for first overdue pickup (sorted by sequence)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'pickup',
            status: 'PENDING',
            sequenceOrder: 2,
            appointmentDate: yesterday,
            latestArrival: '12:00',
            estimatedDockHours: 1,
            stop: { name: 'Second Pickup' },
          },
          {
            actionType: 'pickup',
            status: 'PENDING',
            sequenceOrder: 1,
            appointmentDate: yesterday,
            latestArrival: '10:00',
            estimatedDockHours: 1,
            stop: { name: 'First Pickup' },
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).not.toBeNull();
    expect(result.params.stopName).toBe('First Pickup');
  });
});
