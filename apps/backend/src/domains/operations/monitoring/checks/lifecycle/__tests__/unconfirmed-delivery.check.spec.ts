import { UnconfirmedDeliveryCheck } from '../unconfirmed-delivery.check';

describe('UnconfirmedDeliveryCheck', () => {
  let check: UnconfirmedDeliveryCheck;

  beforeEach(() => {
    check = new UnconfirmedDeliveryCheck();
  });

  const baseContext = {
    driver: { driverId: 'DRV-001', name: 'John Doe' },
    activePlan: null,
    nextPendingStop: null,
    estimatedDriveMinutes: null,
  };

  it('should return null when no delivery stops', () => {
    const ctx = { ...baseContext, load: { loadNumber: 'LD-001', loadStops: [] } };
    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });

  it('should trigger when delivery expected completion has passed', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'delivery',
            status: 'PENDING',
            sequenceOrder: 1,
            appointmentDate: yesterday,
            latestArrival: '10:00',
            estimatedDockHours: 1,
            stop: { name: 'Delivery Warehouse' },
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});

    expect(result).not.toBeNull();
    expect(result.type).toBe('UNCONFIRMED_DELIVERY');
    expect(result.params.actionType).toBe('delivery');
    expect(result.params.stopName).toBe('Delivery Warehouse');
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
            actionType: 'delivery',
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

  it('should skip completed delivery stops', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ctx = {
      ...baseContext,
      load: {
        loadNumber: 'LD-001',
        loadStops: [
          {
            actionType: 'delivery',
            status: 'COMPLETED',
            sequenceOrder: 1,
            appointmentDate: yesterday,
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

  it('should ignore pickup stops', () => {
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
            stop: { name: 'Pickup' },
          },
        ],
      },
    };

    const result = check.run(ctx as any, {});
    expect(result).toBeNull();
  });
});
