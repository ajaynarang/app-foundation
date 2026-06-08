import { recent } from '../helpers/time.helpers';

export function makeAlert(overrides?: Record<string, any>) {
  return {
    id: 1,
    alertId: 'alt-test-001',
    tenantId: 1,
    driverId: 'drv-test-001',
    loadId: 1,
    vehicleId: 1,
    scope: 'LOAD',
    alertType: 'DRIVER_NOT_MOVING',
    category: 'system',
    priority: 'HIGH',
    title: 'Driver Not Moving',
    message: 'Driver has not moved for 30 minutes while in transit.',
    recommendedAction: 'Contact driver to verify status.',
    status: 'ACTIVE',
    acknowledgedAt: null,
    resolvedAt: null,
    autoResolved: false,
    dedupKey: 'drv-test-001:DRIVER_NOT_MOVING:ld-test-001',
    occurrenceCount: 1,
    escalationLevel: 0,
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
