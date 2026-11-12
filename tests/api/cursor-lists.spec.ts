import { test, expect } from '../fixtures/auth.fixture.js';
import { Helpers } from '@app/test-utils/schemas';
import { z } from 'zod';

/**
 * Lists are cursor lists (ADR "API contract", section 3; ADR "ID boundary"), read off a running backend. The
 * service specs walk pages over a fixture and `api-contract.spec.ts` reads the handler types; this holds the
 * wiring: the routes really answer `{ items, nextCursor, total }`, a cursor from the response fetches the next
 * page, and a cursor that was not issued is a 400.
 *
 * Every request here is safe to repeat: nothing is created and nothing is deleted.
 */
test.describe('Lists are cursor lists @api', () => {
  type Reader = { get(path: string): Promise<{ status(): number; json(): Promise<unknown> }> };
  const anyRow = z.record(z.string(), z.unknown());

  const page = async (reader: Reader, path: string) => {
    const res = await reader.get(path);
    const body = await res.json();
    expect(res.status(), `${path}: ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
    return Helpers.expectCursorListContract(anyRow, body, path);
  };

  const MEMBER_LISTS = ['/notifications', '/support/tickets', '/feedback', '/billing/invoices'];
  const ADMIN_LISTS = ['/users', '/invitations', '/api-keys/admin/tenant', '/oauth/clients', '/webhooks'];
  const SUPER_ADMIN_LISTS = [
    '/tenants',
    '/admin/broadcasts',
    '/admin/feedback',
    '/admin/feedback/tenants',
    '/admin/jobs',
    '/admin/events',
    '/admin/deadlines',
    '/admin/ai-spend/tenants',
    '/support/admin/tickets',
    '/support/admin/tenants',
    '/super-admin/login-activity?from=2026-01-01&to=2026-01-31',
  ];

  for (const path of MEMBER_LISTS) {
    test(`GET ${path} answers the cursor envelope`, async ({ asMember }) => {
      const list = await page(asMember, path);
      expect(list.items.length).toBeLessThanOrEqual(50);
    });
  }

  for (const path of ADMIN_LISTS) {
    test(`GET ${path} answers the cursor envelope`, async ({ asAdmin }) => {
      const list = await page(asAdmin, path);
      expect(list.items.length).toBeLessThanOrEqual(50);
    });
  }

  for (const path of SUPER_ADMIN_LISTS) {
    test(`GET ${path} answers the cursor envelope`, async ({ asSuperAdmin }) => {
      const list = await page(asSuperAdmin, path);
      expect(list.items.length).toBeLessThanOrEqual(50);
    });
  }

  test('pages are walked with the cursor the response hands out: every user once, none twice', async ({ asAdmin }) => {
    const first = await page(asAdmin, '/users?limit=1');
    test.skip(first.total < 2, 'needs at least two users in the workspace to have a second page');

    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();

    const seen: unknown[] = first.items.map((user) => user.userId);
    let cursor = first.nextCursor;
    for (let guard = 0; cursor && guard < 500; guard++) {
      const next = await page(asAdmin, `/users?limit=1&cursor=${encodeURIComponent(cursor)}`);
      expect(next.total).toBe(first.total);
      seen.push(...next.items.map((user) => user.userId));
      cursor = next.nextCursor;
    }

    expect(seen).toHaveLength(first.total);
    expect(new Set(seen).size).toBe(first.total);
  });

  test('a row carries its public id and no numeric key', async ({ asAdmin }) => {
    const users = await page(asAdmin, '/users');
    for (const user of users.items) {
      expect(typeof user.userId).toBe('string');
      expect(user).not.toHaveProperty('id');
    }
    const invitations = await page(asAdmin, '/invitations');
    for (const invitation of invitations.items) {
      expect(invitation).not.toHaveProperty('id');
      // The acceptance token is a bearer secret: the list never returns it.
      expect(invitation).not.toHaveProperty('token');
    }
  });

  test('a cursor that was not issued is a 400, and offset or page paging is refused by name', async ({
    asAdmin,
    asMember,
  }) => {
    const badCursor = await asAdmin.get('/users?cursor=not-a-cursor');
    expect(badCursor.status()).toBe(400);
    expect(Helpers.apiErrorEnvelope(400).safeParse(await badCursor.json()).success).toBe(true);

    for (const [path, key] of [
      ['/support/tickets?offset=10', 'offset'],
      ['/notifications?page=2', 'page'],
    ] as const) {
      const res = await asMember.get(path);
      const body = (await res.json()) as { fieldErrors?: Record<string, string> };
      expect(res.status(), JSON.stringify(body)).toBe(400);
      expect(body.fieldErrors ?? {}).toHaveProperty(key);
    }
  });

  test('a page size out of range is clamped, never refused', async ({ asAdmin }) => {
    expect((await page(asAdmin, '/users?limit=5000')).items.length).toBeLessThanOrEqual(100);
    expect((await page(asAdmin, '/users?limit=0')).items.length).toBeLessThanOrEqual(1);
  });

  test('broadcasts and feedback are addressed by a uuid: a numeric id is a 400, an unknown uuid a 404', async ({
    asSuperAdmin,
  }) => {
    const unknown = '0190f1c2-0000-7000-8000-00000000dead';
    for (const base of ['/admin/broadcasts', '/admin/feedback']) {
      expect((await asSuperAdmin.get(`${base}/1`)).status()).toBe(400);
      expect((await asSuperAdmin.get(`${base}/${unknown}`)).status()).toBe(404);
    }
  });
});
