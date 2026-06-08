import { recent } from '../helpers/time.helpers';

export function makeUser(overrides?: Record<string, any>) {
  return {
    id: 1,
    userId: 'usr-test-001',
    email: 'member@test-tenant.com',
    firstName: 'Test',
    lastName: 'Member',
    role: 'MEMBER',
    firebaseUid: 'fb-uid-test-001',
    emailVerified: true,
    phone: '555-000-0010',
    phoneVerified: false,
    isActive: true,
    tenantId: 1,
    lastLoginAt: recent(),
    createdAt: recent(),
    updatedAt: recent(),
    ...overrides,
  };
}

/**
 * Creates a JWT-payload-shaped request user object,
 * as attached by auth guards to request.user.
 */
export function makeRequestUser(overrides?: Record<string, any>) {
  return {
    userId: 'usr-test-001',
    tenantId: 'tnt-test-001',
    tenantDbId: 1,
    role: 'MEMBER',
    email: 'member@test-tenant.com',
    ...overrides,
  };
}
