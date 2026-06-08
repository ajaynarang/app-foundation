import { recent, hoursAgo } from '../helpers/time.helpers';

export function makeRoutePlan(overrides?: Record<string, any>) {
  return {
    id: 1,
    planId: 'rp-test-001',
    planVersion: 1,
    tenantId: 1,
    driverId: 1,
    vehicleId: 1,
    isActive: false,
    status: 'DRAFT',
    optimizationPriority: 'minimize_time',
    totalDistanceMiles: 780,
    totalDriveTimeHours: 12.5,
    totalOnDutyTimeHours: 14,
    totalCostEstimate: 120000,
    totalTripTimeHours: 16,
    totalDrivingDays: 1,
    isFeasible: true,
    departureTime: hoursAgo(1),
    estimatedArrival: recent(),
    dailyBreakdown: [],
    segments: [],
    loads: [],
    events: [],
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
