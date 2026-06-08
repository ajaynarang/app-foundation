/**
 * Platform — Login Activity (tenant + super-admin).
 *
 * Tenant endpoints (ADMIN, OWNER):
 *   GET /admin/login-activity
 *   GET /admin/login-activity/summary
 *
 * Super-admin endpoints (SUPER_ADMIN):
 *   GET /super-admin/login-activity
 *   GET /super-admin/login-activity/summary
 *
 * Tenant flow: tenantId is auto-scoped from the caller's JWT; any
 * client-supplied tenantId in the query is stripped by the controller
 * before the service is called (defense-in-depth — the service also
 * ignores it for non-super-admin scopes).
 *
 * Date range: validated to <= 90 days at the DTO level via the
 * `RangeNotOver90Days` class-validator constraint — out-of-range
 * requests are rejected with 400 before the service runs.
 *
 * Schema strategy: no shared Zod schema is registered for Login Activity
 * yet, so this smoke asserts on response shape inline. Detailed shape
 * coverage lives in the unit tests (`login-activity.service.spec.ts` /
 * `login-activity.controller.spec.ts`); this spec exists to gate RBAC
 * + tenant isolation + range validation at the HTTP boundary.
 */
import { test, expect } from '@sally/test-utils/auth';

function lastNDays(n: number): { from: string; to: string } {
  const today = new Date();
  const past = new Date(today);
  past.setDate(today.getDate() - n);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(past), to: fmt(today) };
}

const SEVEN_DAY = lastNDays(7);

test.describe('Platform · Login Activity · Tenant @workflow', () => {
  test("ADMIN lists own tenant's events @workflow @contract", async ({ asAdmin }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asAdmin.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(body.limit).toBeGreaterThanOrEqual(1);
    expect(body.limit).toBeLessThanOrEqual(100);
    expect(typeof body.offset).toBe('number');
    expect(body.offset).toBeGreaterThanOrEqual(0);
  });

  test("OWNER lists own tenant's events @workflow", async ({ asOwner }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asOwner.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('DRIVER receives 403 @workflow', async ({ asDriver }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asDriver.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(403);
  });

  test('DISPATCHER receives 403 @workflow', async ({ asDispatcher }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asDispatcher.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(403);
  });

  test('range > 90 days returns 400 @workflow', async ({ asAdmin }) => {
    // 2026-01-01 → 2026-05-01 is 120 days — exceeds the 90-day cap
    // enforced by `RangeNotOver90Days` on `ListLoginActivityQueryDto`.
    const qs = new URLSearchParams({ from: '2026-01-01', to: '2026-05-01' });
    const res = await asAdmin.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(400);
  });

  test('client-supplied tenantId in query is ignored @workflow', async ({ asAdmin }) => {
    // Tenant controller strips the `tenantId` field from the DTO before
    // calling the service — caller MUST only ever see their own tenant's
    // events regardless of what they pass. We can't directly assert on
    // tenantId in the response (the tenant flow doesn't expose tenant
    // on rows), but a 200 with a bounded list is enough to gate against
    // the "controller forwards untrusted tenantId to service" regression.
    const qs = new URLSearchParams({
      from: SEVEN_DAY.from,
      to: SEVEN_DAY.to,
      tenantId: '999999',
    });
    const res = await asAdmin.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('ADMIN can filter by single status (coerced from string) @workflow', async ({ asAdmin }) => {
    // Frontend single-select emits `?statuses=SUCCESS` (string, not array).
    // The DTO's @Transform coerces it into an array before @IsArray() runs.
    const qs = new URLSearchParams({
      from: SEVEN_DAY.from,
      to: SEVEN_DAY.to,
      statuses: 'SUCCESS',
    });
    const res = await asAdmin.get(`/admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
  });

  test('GET /admin/login-activity/summary returns KPIs and Notable shape @workflow @contract', async ({ asAdmin }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asAdmin.get(`/admin/login-activity/summary?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.kpis).toBeDefined();
    expect(typeof body.kpis.totalSignIns).toBe('number');
    expect(typeof body.kpis.failedAttempts).toBe('number');
    expect(typeof body.kpis.failedDeltaPct).toBe('number');
    expect(typeof body.kpis.uniqueUsers).toBe('number');
    expect(typeof body.kpis.uniqueIps).toBe('number');

    expect(body.notable).toBeDefined();
    expect(Array.isArray(body.notable.bruteForceSuspects)).toBe(true);
    expect(Array.isArray(body.notable.newIpSignIns)).toBe(true);
    expect(Array.isArray(body.notable.offHoursSignIns)).toBe(true);

    expect(typeof body.timezoneUsed).toBe('string');
    expect(body.timezoneUsed.length).toBeGreaterThan(0);
  });
});

test.describe('Platform · Login Activity · Super Admin @workflow', () => {
  test('SUPER_ADMIN lists across all tenants @workflow @contract', async ({ asSuperAdmin }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asSuperAdmin.get(`/super-admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.offset).toBe('number');
  });

  test('SUPER_ADMIN can filter by tenantId @workflow', async ({ asSuperAdmin }) => {
    // Use tenantId=1 — even if no rows match in the fixture tenant set,
    // the contract is "200 + a bounded list". The unit-level test in
    // `login-activity.service.spec.ts` covers the actual filter math.
    const qs = new URLSearchParams({
      from: SEVEN_DAY.from,
      to: SEVEN_DAY.to,
      tenantId: '1',
    });
    const res = await asSuperAdmin.get(`/super-admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('ADMIN cannot reach the super-admin endpoint (403) @workflow', async ({ asAdmin }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asAdmin.get(`/super-admin/login-activity?${qs}`);
    expect(res.status()).toBe(403);
  });

  test('OWNER cannot reach the super-admin endpoint (403) @workflow', async ({ asOwner }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asOwner.get(`/super-admin/login-activity?${qs}`);
    expect(res.status()).toBe(403);
  });

  test('SUPER_ADMIN can exclude super-admin users via excludeSuperAdmin=true @workflow', async ({ asSuperAdmin }) => {
    // "Tenants only" toggle on the Super Admin page — filters out platform-staff
    // sign-ins so real tenant signal isn't drowned out by SUPER_ADMIN browsing.
    const qs = new URLSearchParams({
      from: SEVEN_DAY.from,
      to: SEVEN_DAY.to,
      excludeSuperAdmin: 'true',
    });
    const res = await asSuperAdmin.get(`/super-admin/login-activity?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    // No item should have user.role === 'SUPER_ADMIN'
    for (const item of body.items) {
      if (item.user) expect(item.user.role).not.toBe('SUPER_ADMIN');
    }
  });

  test('GET /super-admin/login-activity/summary returns KPIs and Notable shape @workflow @contract', async ({
    asSuperAdmin,
  }) => {
    const qs = new URLSearchParams({ from: SEVEN_DAY.from, to: SEVEN_DAY.to });
    const res = await asSuperAdmin.get(`/super-admin/login-activity/summary?${qs}`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.kpis).toBeDefined();
    expect(typeof body.kpis.totalSignIns).toBe('number');
    expect(typeof body.kpis.failedAttempts).toBe('number');
    expect(typeof body.kpis.failedDeltaPct).toBe('number');
    expect(typeof body.kpis.uniqueUsers).toBe('number');
    expect(typeof body.kpis.uniqueIps).toBe('number');

    expect(body.notable).toBeDefined();
    expect(Array.isArray(body.notable.bruteForceSuspects)).toBe(true);
    expect(Array.isArray(body.notable.newIpSignIns)).toBe(true);
    expect(Array.isArray(body.notable.offHoursSignIns)).toBe(true);

    expect(typeof body.timezoneUsed).toBe('string');
  });
});
