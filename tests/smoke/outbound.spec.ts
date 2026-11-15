import { test, expect } from '../fixtures/auth.fixture.js';

/**
 * The super-admin Outbound page's routes (ADR "Outbound gate") against a running backend. `pnpm verify:api` boots it
 * with ENV_TYPE=development and no OUTBOUND_MODE, so the gate is in allowlist mode.
 */
test.describe('Outbound page @smoke', () => {
  test('SUPER_ADMIN reads the mode: allowlist outside production', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/super-admin/outbound/status');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ mode: 'allowlist', isLive: false, environment: 'development' });
  });

  test('SUPER_ADMIN adds a recipient, sees it on the list, and removes it', async ({ asSuperAdmin }) => {
    const value = `smoke-${Date.now()}@example.com`;
    const created = await asSuperAdmin.post('/super-admin/outbound/allow-list', { kind: 'EMAIL', value });
    expect(created.status(), JSON.stringify(await created.json())).toBe(201);
    const entry = (await created.json()) as { id: string; value: string };
    expect(entry.value).toBe(value);

    const list = await asSuperAdmin.get('/super-admin/outbound/allow-list');
    expect(list.status()).toBe(200);
    expect(((await list.json()) as Array<{ id: string }>).map((row) => row.id)).toContain(entry.id);

    const again = await asSuperAdmin.post('/super-admin/outbound/allow-list', { kind: 'EMAIL', value });
    expect(again.status()).toBe(409);

    const removed = await asSuperAdmin.delete(`/super-admin/outbound/allow-list/${entry.id}`);
    expect(removed.status()).toBe(204);
  });

  test('a public mail domain is refused, naming the field', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.post('/super-admin/outbound/allow-list', {
      kind: 'EMAIL_DOMAIN',
      value: 'gmail.com',
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ fieldErrors: { value: expect.any(String) } });
  });

  test('SUPER_ADMIN reads the held-back list', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/super-admin/outbound/held-back');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
  });

  test('a tenant OWNER cannot read it', async ({ asOwner }) => {
    const res = await asOwner.get('/super-admin/outbound/status');
    expect(res.status()).toBe(403);
  });
});
