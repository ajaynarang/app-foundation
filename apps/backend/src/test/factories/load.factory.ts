import { recent, farFuture, dateOnly, hoursAgo } from '../helpers/time.helpers';

export function makeLoad(overrides?: Record<string, any>) {
  return {
    id: 1,
    loadId: 'ld-test-001',
    loadNumber: 'LD-1001',
    tenantId: 1,
    status: 'PENDING',
    weightLbs: 40000,
    commodityType: 'General Freight',
    rateCents: 250000,
    billingStatus: null,
    pieces: 24,
    isActive: true,
    intakeSource: 'manual',
    customerId: 1,
    driverId: null,
    vehicleId: null,
    pickupDate: dateOnly(recent()),
    deliveryDate: dateOnly(farFuture()),
    originCity: 'Dallas',
    originState: 'TX',
    destinationCity: 'Atlanta',
    destinationState: 'GA',
    estimatedMiles: 780,
    actualMiles: null,
    assignedAt: null,
    inTransitAt: null,
    deliveredAt: null,
    cancelledAt: null,
    stops: [],
    charges: [],
    events: [],
    notes: [],
    invoices: [],
    driver: null,
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}

export function makeAssignedLoad(overrides?: Record<string, any>) {
  return makeLoad({
    status: 'ASSIGNED',
    driverId: 1,
    vehicleId: 1,
    assignedAt: hoursAgo(2),
    driver: { id: 1, driverId: 'drv-test-001', name: 'John Driver' },
    ...overrides,
  });
}

export function makeInTransitLoad(overrides?: Record<string, any>) {
  return makeLoad({
    status: 'IN_TRANSIT',
    driverId: 1,
    vehicleId: 1,
    assignedAt: hoursAgo(6),
    inTransitAt: hoursAgo(1),
    driver: { id: 1, driverId: 'drv-test-001', name: 'John Driver' },
    ...overrides,
  });
}

export function makeDeliveredLoad(overrides?: Record<string, any>) {
  return makeLoad({
    status: 'DELIVERED',
    driverId: 1,
    vehicleId: 1,
    assignedAt: hoursAgo(48),
    inTransitAt: hoursAgo(24),
    deliveredAt: hoursAgo(1),
    actualMiles: 785,
    billingStatus: 'PENDING_DOCUMENTS',
    driver: { id: 1, driverId: 'drv-test-001', name: 'John Driver' },
    ...overrides,
  });
}
