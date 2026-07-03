import { farFuture, recent } from '../helpers/time.helpers';

export function makeTenant(overrides?: Record<string, any>) {
  return {
    id: 1,
    tenantId: 'tnt-test-001',
    companyName: 'Test Tenant LLC',
    subdomain: 'test-tenant',
    contactEmail: 'admin@test-tenant.com',
    contactPhone: '555-000-0001',
    status: 'ACTIVE',
    isActive: true,
    plan: 'PROFESSIONAL',
    trialStartedAt: recent(),
    trialEndsAt: farFuture(),
    planAssignedAt: recent(),
    onboardingCompletedAt: recent(),
    onboardingProgress: {},
    jobsPaused: false,
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}
