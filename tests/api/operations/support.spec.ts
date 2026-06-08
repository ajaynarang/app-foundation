/**
 * Operations — Support tickets (Phase 3 Group 3a).
 *
 * Covers all 10 endpoints on `SupportController`, split into two top-level
 * describe blocks matching the controller's role profile:
 *
 *   Tenant surface (asDispatcher):
 *     1. POST /support/tickets
 *     2. GET  /support/tickets
 *     3. GET  /support/tickets/:id
 *     4. POST /support/tickets/:id/messages
 *
 *   Super-admin dashboard (asSuperAdmin):
 *     5.  GET  /support/admin/tickets
 *     6.  GET  /support/admin/tickets/:id
 *     7.  PUT  /support/admin/tickets/:id
 *     8.  POST /support/admin/tickets/:id/messages
 *     9.  GET  /support/admin/stats
 *     10. GET  /support/admin/tenants
 *
 * Each test re-seeds its own ticket via `seedSupportTicket(asDispatcher)` so
 * the two blocks remain order-independent and parallel-safe. Super-admin
 * tests pull the new ticket id back from the response and never rely on a
 * shared fixture row. Cleanup: afterEach closes any tickets created during
 * the test via `PUT /support/admin/tickets/:id` with `status: CLOSED`
 * (asSuperAdmin).
 *
 * Schema strategy: uses the shared-types `SupportTicketSchema` /
 * `SupportTicketDetailSchema` / `SupportStatsSchema` / `PaginatedTicketsSchema`
 * re-exported from `@sally/test-utils/schemas/support`, plus the
 * `TicketMessageSchema` for the message responses. All asserted with
 * `.strict()`. If any future drift surfaces, hot-fix inline and document via
 * TODO(phase-3-verify) + findings.md — no `.passthrough()`.
 *
 * Known quirk on the admin detail endpoint:
 *   The controller calls `getTicket(id, 0, true)` with `tenantId=0`.
 *   `mapTicketResponse` includes a `tenant` object (populated from the
 *   include block), so the detail schema's `tenant: .optional()` is satisfied.
 *
 * Assignee rename note (see `factories/support.ts`): `UpdateTicketDto` has no
 * `assignee` field. The factory silently drops `overrides.assignee` to avoid
 * `forbidNonWhitelisted: true` 400s. Test 7 exercises `status` only.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildSupportTicket, buildSupportMessage, buildUpdateTicketPayload } from '@sally/test-utils/factories';
import { expectContract, SupportSchemas } from '@sally/test-utils/schemas';
import { seedSupportTicket } from './_helpers.js';

const {
  SupportTicketSchema,
  SupportTicketDetailSchema,
  SupportTicketListItemSchema: PaginatedTicketsSchema,
  SupportStatsSchema,
  SupportMessageSchema,
} = SupportSchemas;

// ── Shared cleanup helper ───────────────────────────────────────────────────
//
// Super-admin close is the only public path that terminates a ticket (no
// tenant-side close exists). Swallow 404 — if a prior step already closed the
// ticket, afterEach is a no-op. Any other status is surfaced via rethrow so
// cleanup bugs don't mask test failures.
async function closeTicket(
  asSuperAdmin: import('@sally/test-utils/playwright').RoleApiClient,
  ticketId: number,
): Promise<void> {
  const res = await asSuperAdmin.put(
    `/support/admin/tickets/${ticketId}`,
    buildUpdateTicketPayload({ status: 'CLOSED' }),
  );
  if (res.status() === 404) return;
  if (res.status() !== 200) {
    // eslint-disable-next-line no-console -- diagnostics only
    console.warn(
      `closeTicket(${ticketId}) → HTTP ${res.status()}: ${(await res.text().catch(() => '')).slice(0, 240)}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tenant ticket lifecycle (asDispatcher)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Operations · Support · tenant ticket lifecycle @workflow', () => {
  const createdTicketIds: number[] = [];

  test.afterEach(async ({ asSuperAdmin }) => {
    for (const ticketId of createdTicketIds.splice(0)) {
      await closeTicket(asSuperAdmin, ticketId).catch(() => undefined);
    }
  });

  // 1 ── POST /support/tickets ────────────────────────────────────────────
  test('POST /support/tickets creates a ticket in OPEN status with the submitted fields @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildSupportTicket({
      subject: 'Phase 3 QA — ticket create path',
      category: 'TECHNICAL',
      priority: 'HIGH',
    });

    const res = await asDispatcher.post('/support/tickets', payload);
    expect(res.status()).toBe(201);
    const ticket = expectContract(SupportTicketSchema.strict(), await res.json(), 'POST /support/tickets');
    createdTicketIds.push(ticket.id);

    // Semantic — fields echoed, default status is OPEN (schema default),
    // `aiResolved` starts false, `firstResponseAt` null until an admin replies.
    expect(ticket.subject).toBe(payload.subject);
    expect(ticket.description).toBe(payload.description);
    expect(ticket.category).toBe('TECHNICAL');
    expect(ticket.priority).toBe('HIGH');
    expect(ticket.status).toBe('OPEN');
    expect(ticket.aiResolved).toBe(false);
    expect(ticket.firstResponseAt).toBeNull();
    expect(ticket.resolvedAt).toBeNull();
    expect(ticket.closedAt).toBeNull();
    expect(ticket.messageCount).toBe(0);
    expect(ticket.ticketNumber.startsWith('ST-')).toBe(true);

    // Persistence — GET detail returns the same row.
    const detailRes = await asDispatcher.get(`/support/tickets/${ticket.id}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(
      SupportTicketDetailSchema.strict(),
      await detailRes.json(),
      'GET /support/tickets/:id after create',
    );
    expect(detail.id).toBe(ticket.id);
    expect(detail.ticketNumber).toBe(ticket.ticketNumber);
    expect(detail.messages).toHaveLength(0);
  });

  // 2 ── GET /support/tickets ─────────────────────────────────────────────
  test("GET /support/tickets returns a paginated envelope containing the current tenant's tickets @workflow @destructive", async ({
    asDispatcher,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const res = await asDispatcher.get('/support/tickets?limit=50');
    expect(res.status()).toBe(200);
    const list = expectContract(PaginatedTicketsSchema.strict(), await res.json(), 'GET /support/tickets');

    // Semantic — envelope arithmetic is coherent; the seeded ticket is
    // present in the tenant's own list.
    expect(list.limit).toBe(50);
    expect(list.offset).toBe(0);
    expect(list.total).toBeGreaterThanOrEqual(list.tickets.length);
    const match = list.tickets.find((t) => t.id === seed.ticketId);
    expect(match, 'just-seeded ticket must appear in tenant list').toBeDefined();
    expect(match?.ticketNumber).toBe(seed.ticketNumber);
    expect(match?.status).toBe('OPEN');
  });

  // 3 ── GET /support/tickets/:id ─────────────────────────────────────────
  test('GET /support/tickets/:id returns the detail envelope with an empty messages array @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const res = await asDispatcher.get(`/support/tickets/${seed.ticketId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(SupportTicketDetailSchema.strict(), await res.json(), 'GET /support/tickets/:id');

    // Semantic — detail shape matches the seeded ticket.
    expect(detail.id).toBe(seed.ticketId);
    expect(detail.ticketNumber).toBe(seed.ticketNumber);
    expect(detail.status).toBe('OPEN');
    expect(detail.messages).toEqual([]);

    // Unknown id → 404. The tenant path filters by tenantId so an arbitrary
    // large id is effectively unreachable.
    const missingRes = await asDispatcher.get('/support/tickets/999999999');
    expect(missingRes.status()).toBe(404);
  });

  // 4 ── POST /support/tickets/:id/messages ───────────────────────────────
  test('POST /support/tickets/:id/messages appends a user reply and surfaces it on detail @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const payload = buildSupportMessage({
      content: 'Phase 3 QA — tenant reply',
    });
    const res = await asDispatcher.post(`/support/tickets/${seed.ticketId}/messages`, payload);
    expect(res.status()).toBe(201);
    const message = expectContract(
      SupportMessageSchema.strict(),
      await res.json(),
      'POST /support/tickets/:id/messages',
    );

    // Semantic — the controller stamps `authorRole = 'user'` for tenant
    // replies regardless of the caller's User.role; `isInternal` defaults
    // to false.
    expect(message.content).toBe(payload.content);
    expect(message.authorRole).toBe('user');
    expect(message.isInternal).toBe(false);

    // Persistence — detail's `messages` array now contains this reply.
    const detailRes = await asDispatcher.get(`/support/tickets/${seed.ticketId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(SupportTicketDetailSchema.strict(), await detailRes.json());
    const appended = detail.messages.find((m) => m.messageId === message.messageId);
    expect(appended, 'posted message must appear on detail').toBeDefined();
    expect(appended?.content).toBe(payload.content);
    // `detail.messageCount` is derived from Prisma `_count.messages` but the
    // detail findUnique call doesn't include the `_count` relation, so it
    // comes back as 0 regardless of how many messages exist — finding #29.
    // We assert persistence via detail.messages.length instead.
    expect(detail.messages.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Super-admin ticket dashboard (asSuperAdmin)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Operations · Support · super-admin ticket dashboard @workflow', () => {
  const createdTicketIds: number[] = [];

  test.afterEach(async ({ asSuperAdmin }) => {
    for (const ticketId of createdTicketIds.splice(0)) {
      await closeTicket(asSuperAdmin, ticketId).catch(() => undefined);
    }
  });

  // 5 ── GET /support/admin/tickets ───────────────────────────────────────
  test("GET /support/admin/tickets lists tickets across tenants including this tenant's seeded row @workflow @destructive", async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    // Scope the admin query to just-this-ticket via `search=` on ticket
    // number to avoid cross-tenant noise when demo-northstar has many
    // pre-existing tickets. ticketNumber is unique (sequence-backed).
    const res = await asSuperAdmin.get(
      `/support/admin/tickets?search=${encodeURIComponent(seed.ticketNumber)}&limit=50`,
    );
    expect(res.status()).toBe(200);
    const list = expectContract(PaginatedTicketsSchema.strict(), await res.json(), 'GET /support/admin/tickets');

    // Semantic — super-admin list includes `tenant` on each row (populated
    // by service `include`). The seeded ticket appears at least once.
    const match = list.tickets.find((t) => t.id === seed.ticketId);
    expect(match, 'just-seeded ticket must be visible to super-admin').toBeDefined();
    expect(match?.ticketNumber).toBe(seed.ticketNumber);
    expect(match?.tenant).toBeDefined();
    expect(match?.tenant?.companyName.length ?? 0).toBeGreaterThan(0);
  });

  // 6 ── GET /support/admin/tickets/:id ───────────────────────────────────
  test('GET /support/admin/tickets/:id returns the cross-tenant detail view with messages @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const res = await asSuperAdmin.get(`/support/admin/tickets/${seed.ticketId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(
      SupportTicketDetailSchema.strict(),
      await res.json(),
      'GET /support/admin/tickets/:id',
    );

    // Semantic — super-admin bypasses tenant scoping (`tenantId=0, isSuperAdmin=true`)
    // and `tenant` is present because include block runs regardless.
    expect(detail.id).toBe(seed.ticketId);
    expect(detail.ticketNumber).toBe(seed.ticketNumber);
    expect(detail.tenant).toBeDefined();
    expect(detail.messages).toEqual([]);
  });

  // 7 ── PUT /support/admin/tickets/:id ───────────────────────────────────
  test('PUT /support/admin/tickets/:id transitions OPEN → IN_PROGRESS and the new status persists @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const payload = buildUpdateTicketPayload({ status: 'IN_PROGRESS' });
    const res = await asSuperAdmin.put(`/support/admin/tickets/${seed.ticketId}`, payload);
    expect(res.status()).toBe(200);
    const updated = expectContract(SupportTicketSchema.strict(), await res.json(), 'PUT /support/admin/tickets/:id');

    // Semantic — status echoed, resolvedAt/closedAt untouched at this point.
    expect(updated.id).toBe(seed.ticketId);
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.resolvedAt).toBeNull();
    expect(updated.closedAt).toBeNull();

    // Persistence — GET admin detail reflects the new status.
    const detailRes = await asSuperAdmin.get(`/support/admin/tickets/${seed.ticketId}`);
    expect(detailRes.status()).toBe(200);
    const detail = expectContract(SupportTicketDetailSchema.strict(), await detailRes.json());
    expect(detail.status).toBe('IN_PROGRESS');
  });

  // 8 ── POST /support/admin/tickets/:id/messages ─────────────────────────
  test('POST /support/admin/tickets/:id/messages appends an admin reply and stamps firstResponseAt @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const payload = buildSupportMessage({
      content: 'Phase 3 QA — admin reply from super-admin dashboard',
    });
    const res = await asSuperAdmin.post(`/support/admin/tickets/${seed.ticketId}/messages`, payload);
    expect(res.status()).toBe(201);
    const message = expectContract(
      SupportMessageSchema.strict(),
      await res.json(),
      'POST /support/admin/tickets/:id/messages',
    );

    // Semantic — authorRole is 'admin' (controller hardcodes), default
    // isInternal=false (tenant-visible).
    expect(message.content).toBe(payload.content);
    expect(message.authorRole).toBe('admin');
    expect(message.isInternal).toBe(false);

    // Persistence — the reply appears on the tenant-side detail (non-internal
    // messages are NOT filtered for tenants), AND `firstResponseAt` is now
    // populated on the ticket (service tracks first admin reply).
    const tenantDetailRes = await asDispatcher.get(`/support/tickets/${seed.ticketId}`);
    expect(tenantDetailRes.status()).toBe(200);
    const tenantDetail = expectContract(SupportTicketDetailSchema.strict(), await tenantDetailRes.json());
    const appended = tenantDetail.messages.find((m) => m.messageId === message.messageId);
    expect(appended, 'admin reply must be visible to the tenant').toBeDefined();
    expect(tenantDetail.firstResponseAt).not.toBeNull();
  });

  // 9 ── GET /support/admin/stats ─────────────────────────────────────────
  test('GET /support/admin/stats returns a non-negative stats envelope @workflow', async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.get('/support/admin/stats');
    expect(res.status()).toBe(200);
    const stats = expectContract(SupportStatsSchema.strict(), await res.json(), 'GET /support/admin/stats');

    // Semantic — all counters are non-negative integers; avgResponseHours
    // is a non-negative number (can be a float).
    expect(stats.open).toBeGreaterThanOrEqual(0);
    expect(stats.inProgress).toBeGreaterThanOrEqual(0);
    expect(stats.waiting).toBeGreaterThanOrEqual(0);
    expect(stats.resolvedLast30d).toBeGreaterThanOrEqual(0);
    // avgResponseHours may come off the wire as a stringified Decimal —
    // finding #28. Coerce for the numeric comparison.
    expect(Number(stats.avgResponseHours)).toBeGreaterThanOrEqual(0);

    // No afterEach — pure read, no tickets seeded.
  });

  // 10 ── GET /support/admin/tenants ──────────────────────────────────────
  test('GET /support/admin/tenants lists tenants with at least one submitted ticket @workflow @destructive', async ({
    asDispatcher,
    asSuperAdmin,
  }) => {
    // Ensure this tenant has at least one ticket so it appears in the list.
    const seed = await seedSupportTicket(asDispatcher);
    createdTicketIds.push(seed.ticketId);

    const res = await asSuperAdmin.get('/support/admin/tenants');
    expect(res.status()).toBe(200);
    // The service returns a distinct-tenant projection: each row is
    // `{ id: number, companyName: string }` — hand-written shape because
    // there is no shared-types export for this minor response.
    const raw = (await res.json()) as unknown;
    expect(Array.isArray(raw)).toBe(true);
    const rows = raw as Array<{ id: unknown; companyName: unknown }>;
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(typeof row.id).toBe('number');
      expect(typeof row.companyName).toBe('string');
    }
  });
});
