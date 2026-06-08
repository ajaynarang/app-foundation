import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Auth & Role Verification @smoke', () => {
  test('DISPATCHER token is valid — can access /loads', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/loads');
    expect(res.ok(), `Dispatcher /loads returned ${res.status()}`).toBeTruthy();
  });

  test('ADMIN token is valid — can access /users', async ({ asAdmin }) => {
    const res = await asAdmin.get('/users');
    expect(res.ok(), `Admin /users returned ${res.status()}`).toBeTruthy();
  });

  test('OWNER token is valid — can access /billing/overview', async ({ asOwner }) => {
    const res = await asOwner.get('/billing/overview');
    expect(res.ok(), `Owner /billing/overview returned ${res.status()}`).toBeTruthy();
  });

  test('DRIVER token is valid — can access /notifications', async ({ asDriver }) => {
    const res = await asDriver.get('/notifications');
    expect(res.ok(), `Driver /notifications returned ${res.status()}`).toBeTruthy();
  });

  test('SUPER_ADMIN token is valid — can access /tenants', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/tenants');
    expect(res.ok(), `SuperAdmin /tenants returned ${res.status()}`).toBeTruthy();
  });

  test('anonymous request to protected endpoint returns 401', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/loads');
    expect(res.status()).toBe(401);
  });

  test('anonymous request to /users returns 401', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/users');
    expect(res.status()).toBe(401);
  });
});

test.describe('Critical Reads @smoke', () => {
  const dispatcherEndpoints = [
    '/loads',
    '/drivers',
    '/vehicles',
    '/customers',
    '/alerts',
    '/notifications',
    '/settlements',
    '/invoices',
  ];

  for (const endpoint of dispatcherEndpoints) {
    test(`DISPATCHER can read ${endpoint}`, async ({ asDispatcher }) => {
      const res = await asDispatcher.get(endpoint);
      expect(res.ok(), `${endpoint} returned ${res.status()}`).toBeTruthy();
    });
  }

  const superAdminEndpoints = [
    '/tenants',
    '/plans',
    '/admin/broadcasts',
    '/admin/feedback',
  ];

  for (const endpoint of superAdminEndpoints) {
    test(`SUPER_ADMIN can read ${endpoint}`, async ({ asSuperAdmin }) => {
      const res = await asSuperAdmin.get(endpoint);
      expect(res.ok(), `${endpoint} returned ${res.status()}`).toBeTruthy();
    });
  }
});
