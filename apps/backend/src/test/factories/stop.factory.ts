import { recent } from '../helpers/time.helpers';

export function makeStop(overrides?: Record<string, any>) {
  return {
    id: 1,
    stopId: 'stp-test-001',
    name: 'Dallas Distribution Center',
    address: '1234 Commerce St',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
    lat: 32.7767,
    lon: -96.797,
    locationType: 'warehouse',
    timezone: 'America/Chicago',
    isActive: true,
    tenantId: 1,
    createdAt: recent(),
    ...overrides,
  };
}

export function makeLoadStop(overrides?: Record<string, any>) {
  return {
    id: 1,
    sequenceOrder: 1,
    actionType: 'pickup',
    status: 'PENDING',
    appointmentDate: recent(),
    earliestArrival: null,
    latestArrival: null,
    estimatedDockHours: 2,
    arrivedAt: null,
    departedAt: null,
    completedAt: null,
    dockInAt: null,
    stop: makeStop(),
    ...overrides,
  };
}
