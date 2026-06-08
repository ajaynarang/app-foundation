/**
 * Fleet — Loads Driver Actions API (Phase 1 Group 7c)
 *
 * Covers every endpoint on `DriverActionsController`:
 *
 *   - POST  /loads/:load_id/driver-actions                                → submit  (DRIVER only)
 *   - PATCH /loads/:load_id/driver-actions/:actionRequestId/acknowledge   → ack     (DISPATCHER/ADMIN)
 *   - PATCH /loads/:load_id/driver-actions/:actionRequestId/resolve       → resolve (DISPATCHER/ADMIN)
 *   - GET   /loads/:load_id/driver-actions                                → list    (DISPATCHER/ADMIN/DRIVER)
 *
 * Role + ownership rules (from the controller):
 *   - POST guards on `user.driverDbId` and requires the load's `driverId`
 *     to match the authenticated driver's DB id. Every submit test must
 *     therefore run as the seeded `asDriver` fixture on a load that was
 *     explicitly assigned to that driver row. Any other driver account
 *     would 403.
 *   - acknowledge/resolve are dispatcher/admin and do NOT re-validate load
 *     ownership — they look the action up by `actionRequestId` + tenant.
 *
 * State machine (from `driver-actions.service.ts`):
 *   submitted ──acknowledge──▶ acknowledged ──resolve──▶ resolved
 *                     │                                       ▲
 *                     └───────── resolve (direct) ────────────┘
 *
 * Re-acknowledge of a non-submitted action → 400.
 * Re-resolve of a resolved action → 400.
 *
 * Setup note: we use `createAssignedLoad(asDispatcher, asAdmin, {
 * driverPublicId: seededDriverPublicId(authState) })` so the fresh load is
 * owned by the seeded DRIVER fixture — that is the only driver row the
 * asDriver JWT is scoped to, so `user.driverDbId === load.driverId` is
 * guaranteed. No vehicle is needed for this flow (assignment accepts
 * driver-only).
 *
 * `createdDriver: false` in every case (we reuse the seeded driver), so
 * there is nothing to deactivate in afterEach — just cleanup the load.
 *
 * Schema strategy: hand-written in
 * `packages/test-utils/src/schemas/load-subresources.ts` — the shared-types
 * driver-action schemas are on `zod/v4` and this workspace is on zod v3.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriverAction } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';

import { createAssignedLoad, seededDriverPublicId } from './_helpers';

const { DriverActionSchema } = LoadSubresourceSchemas;

test.describe('Fleet · Loads Driver Actions @workflow', () => {
  const createdLoadIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
  });

  // 1 ── POST /loads/:load_id/driver-actions ──────────────────────────
  test('POST /loads/:load_id/driver-actions submits a detention action as the assigned driver @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin, {
      driverPublicId: seededDriverPublicId(authState),
    });
    createdLoadIds.push(setup.loadId);

    const payload = buildDriverAction({
      actionType: 'detention',
      note: 'QA driver action submit — 3h dock wait',
      metadata: { dockArrivedAt: '2026-04-18T08:00:00.000Z', waitMinutes: 185 },
    });
    const res = await asDriver.post(`/loads/${setup.loadId}/driver-actions`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(DriverActionSchema.strict(), await res.json(), 'POST /loads/:id/driver-actions');

    // Semantic
    expect(body.loadId).toBe(setup.id);
    expect(body.driverId).toBeGreaterThan(0);
    expect(body.actionType).toBe('detention');
    expect(body.status).toBe('submitted');
    expect(body.note).toBe(payload.note);
    expect(body.acknowledgedAt).toBeNull();
    expect(body.resolvedAt).toBeNull();
    expect(body.actionRequestId.length).toBeGreaterThan(0);

    // Persistence — list as dispatcher confirms the row landed.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/driver-actions`);
    expect(listRes.status()).toBe(200);
    const list = (await listRes.json()) as unknown;
    expect(Array.isArray(list)).toBe(true);
    const items = list as Array<{ actionRequestId: string; status: string }>;
    const persisted = items.find((a) => a.actionRequestId === body.actionRequestId);
    expect(persisted).toBeDefined();
    expect(persisted?.status).toBe('submitted');
  });

  // 2 ── PATCH /loads/:load_id/driver-actions/:id/acknowledge ─────────
  test('PATCH /loads/:load_id/driver-actions/:id/acknowledge flips submitted → acknowledged @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin, {
      driverPublicId: seededDriverPublicId(authState),
    });
    createdLoadIds.push(setup.loadId);

    // Driver submits so there is a pending action to ack.
    const submitRes = await asDriver.post(
      `/loads/${setup.loadId}/driver-actions`,
      buildDriverAction({ actionType: 'scale_ticket' }),
    );
    expect(submitRes.status()).toBe(201);
    const submitted = expectContract(DriverActionSchema.strict(), await submitRes.json());
    expect(submitted.status).toBe('submitted');

    const res = await asDispatcher.patch(
      `/loads/${setup.loadId}/driver-actions/${submitted.actionRequestId}/acknowledge`,
      {},
    );
    expect(res.status()).toBe(200);
    const acked = expectContract(
      DriverActionSchema.strict(),
      await res.json(),
      'PATCH /driver-actions/:id/acknowledge',
    );

    // Semantic — status flipped, timestamp set, note preserved.
    expect(acked.actionRequestId).toBe(submitted.actionRequestId);
    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledgedAt).not.toBeNull();
    expect(acked.resolvedAt).toBeNull();
    expect(acked.actionType).toBe('scale_ticket');

    // Persistence — list reflects the transition.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/driver-actions`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      actionRequestId: string;
      status: string;
    }>;
    const row = items.find((a) => a.actionRequestId === submitted.actionRequestId);
    expect(row?.status).toBe('acknowledged');

    // Double-acknowledge → 400 (already acknowledged/resolved).
    const againRes = await asDispatcher.patch(
      `/loads/${setup.loadId}/driver-actions/${submitted.actionRequestId}/acknowledge`,
      {},
    );
    expect(againRes.status()).toBe(400);
  });

  // 3 ── PATCH /loads/:load_id/driver-actions/:id/resolve ─────────────
  test('PATCH /loads/:load_id/driver-actions/:id/resolve transitions the action to resolved @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin, {
      driverPublicId: seededDriverPublicId(authState),
    });
    createdLoadIds.push(setup.loadId);

    const submitRes = await asDriver.post(
      `/loads/${setup.loadId}/driver-actions`,
      buildDriverAction({
        actionType: 'fuel_receipt',
        metadata: { gallons: 110.2, totalCents: 44000 },
      }),
    );
    expect(submitRes.status()).toBe(201);
    const submitted = expectContract(DriverActionSchema.strict(), await submitRes.json());

    const res = await asDispatcher.patch(
      `/loads/${setup.loadId}/driver-actions/${submitted.actionRequestId}/resolve`,
      {},
    );
    expect(res.status()).toBe(200);
    const resolved = expectContract(DriverActionSchema.strict(), await res.json(), 'PATCH /driver-actions/:id/resolve');

    // Semantic — resolve path works directly from submitted (no ack required).
    expect(resolved.actionRequestId).toBe(submitted.actionRequestId);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.actionType).toBe('fuel_receipt');

    // Persistence — dispatcher list sees the terminal state.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/driver-actions`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      actionRequestId: string;
      status: string;
    }>;
    const row = items.find((a) => a.actionRequestId === submitted.actionRequestId);
    expect(row?.status).toBe('resolved');

    // Re-resolve of a resolved action → 400.
    const againRes = await asDispatcher.patch(
      `/loads/${setup.loadId}/driver-actions/${submitted.actionRequestId}/resolve`,
      {},
    );
    expect(againRes.status()).toBe(400);
  });

  // 4 ── GET /loads/:load_id/driver-actions ───────────────────────────
  test('GET /loads/:load_id/driver-actions lists all actions in createdAt-desc order @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin, {
      driverPublicId: seededDriverPublicId(authState),
    });
    createdLoadIds.push(setup.loadId);

    // Submit two actions as the driver to prove the list returns more than one.
    const firstRes = await asDriver.post(
      `/loads/${setup.loadId}/driver-actions`,
      buildDriverAction({ actionType: 'detention', note: 'first' }),
    );
    expect(firstRes.status()).toBe(201);
    const first = expectContract(DriverActionSchema.strict(), await firstRes.json());

    const secondRes = await asDriver.post(
      `/loads/${setup.loadId}/driver-actions`,
      buildDriverAction({ actionType: 'issue_report', note: 'second' }),
    );
    expect(secondRes.status()).toBe(201);
    const second = expectContract(DriverActionSchema.strict(), await secondRes.json());

    const res = await asDispatcher.get(`/loads/${setup.loadId}/driver-actions`);
    expect(res.status()).toBe(200);
    const raw = (await res.json()) as unknown;
    expect(Array.isArray(raw)).toBe(true);
    const list = raw as unknown[];
    // Validate every item against the strict schema — catches drift.
    const parsed = list.map((item, i) =>
      expectContract(DriverActionSchema.strict(), item, `GET /loads/:id/driver-actions[${i}]`),
    );

    // Semantic — both of ours are present.
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    const ids = parsed.map((a) => a.actionRequestId);
    expect(ids).toContain(first.actionRequestId);
    expect(ids).toContain(second.actionRequestId);

    // Ordering — service emits `orderBy: { createdAt: 'desc' }`. The
    // second submit must precede the first in the list.
    const firstIdx = ids.indexOf(first.actionRequestId);
    const secondIdx = ids.indexOf(second.actionRequestId);
    expect(secondIdx).toBeLessThan(firstIdx);

    // Scope — every item on this load carries the load's numeric id.
    for (const item of parsed) {
      expect(item.loadId).toBe(setup.id);
    }
  });
});
