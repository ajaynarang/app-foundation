import { farFuture, recent } from '../helpers/time.helpers';

export function makeTenant(overrides?: Record<string, any>) {
  return {
    id: 1,
    tenantId: 'tnt-test-001',
    companyName: 'Test Trucking LLC',
    subdomain: 'test-trucking',
    contactEmail: 'admin@test-trucking.com',
    contactPhone: '555-000-0001',
    status: 'ACTIVE',
    dotNumber: '1234567',
    carrierType: 'FOR_HIRE_INTERSTATE',
    mcNumber: 'MC-123456',
    fleetSize: 10,
    isActive: true,
    plan: 'PROFESSIONAL',
    trialStartedAt: recent(),
    trialEndsAt: farFuture(),
    planAssignedAt: recent(),
    onboardingCompletedAt: recent(),
    onboardingProgress: {},
    fleetLimitWarning: false,
    jobsPaused: false,
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
