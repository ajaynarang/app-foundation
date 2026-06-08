/**
 * Fleet — Loads Money Codes API (Phase 1 Group 7c)
 *
 * Covers every endpoint on `MoneyCodesController`:
 *
 *   - POST  /loads/:load_id/money-codes                    → request (DRIVER+DISPATCHER+ADMIN)
 *   - POST  /loads/:load_id/money-codes/issue              → proactive issue (DISPATCHER+ADMIN)
 *   - GET   /loads/:load_id/money-codes/insights           → Sally insights (DISPATCHER+ADMIN)
 *   - GET   /loads/:load_id/money-codes                    → list (DRIVER+DISPATCHER+ADMIN)
 *   - PATCH /loads/:load_id/money-codes/:mcId/approve      → approve (DISPATCHER+ADMIN)
 *   - PATCH /loads/:load_id/money-codes/:mcId/deny         → deny (DISPATCHER+ADMIN)
 *   - PATCH /loads/:load_id/money-codes/:mcId/use          → mark used (DRIVER)
 *   - PATCH /loads/:load_id/money-codes/:mcId/cancel       → cancel (DRIVER+DISPATCHER+ADMIN)
 *
 * Role + ownership rules (from the controller):
 *   - POST: when the caller is a DRIVER, `load.driverId` MUST equal
 *     `user.driverDbId` (else 403). When DISPATCHER/ADMIN, the load must
 *     have a driver assigned (else 404 — `No driver assigned to this load`).
 *   - POST /issue: load must already have a driver (404 otherwise); the
 *     code is created in `approved` state with `code` + `expiresAt`.
 *   - PATCH /use: DRIVER-only. Creates a `lumper` LoadCharge inside a
 *     transaction.
 *   - PATCH /cancel: any of DRIVER/DISPATCHER/ADMIN; we exercise the
 *     dispatcher path here (no ownership check).
 *
 * State machine (from `VALID_STATUS_TRANSITIONS` in money-code.service.ts):
 *   requested ──approve──▶ approved ──use──▶ used            (terminal)
 *       │                      │
 *       ├── deny ──▶ denied    ├── expire ──▶ expired         (terminal)
 *       └── cancel ──▶ cancelled (terminal)
 *       (denied/used/expired/cancelled all have no outgoing transitions)
 *
 * Setup: every test that acts as the DRIVER needs the load assigned to the
 * seeded asDriver fixture's row. We use `createAssignedLoad(asDispatcher,
 * asAdmin, { driverPublicId: seededDriverPublicId(authState) })`. Tests
 * that only use DISPATCHER still need an assigned driver (for
 * /insights → load.driverId lookup, for /issue → 404 guard), so we use the
 * same path for every test here — consistent fixture, one assigned load.
 *
 * `createdDriver: false` in every case → no driver deactivation needed.
 *
 * Schema strategy: hand-written in
 * `packages/test-utils/src/schemas/load-subresources.ts`. Shared-types
 * money-code schemas are on `zod/v4` and this workspace is on zod v3.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildMoneyCodeRequest, buildMoneyCodeIssue } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import type { AuthState } from '@sally/test-utils/auth';

import { createAssignedLoad, seededDriverPublicId } from './_helpers';

const { MoneyCodeSchema, MoneyCodeInsightsResponseSchema } = LoadSubresourceSchemas;

// ── Helpers ─────────────────────────────────────────────────────────

interface RequestedMoneyCode {
  moneyCodeId: string;
  id: number;
}

/**
 * Submit a money code request as the seeded DRIVER fixture against a load
 * that is already assigned to that driver. The caller owns the returned
 * `moneyCodeId` for downstream approve/deny/use/cancel tests.
 */
async function requestMoneyCodeAsDriver(
  asDriver: RoleApiClient,
  loadId: string,
  overrides: Parameters<typeof buildMoneyCodeRequest>[0] = {},
): Promise<RequestedMoneyCode> {
  const payload = buildMoneyCodeRequest(overrides);
  const res = await asDriver.post(`/loads/${loadId}/money-codes`, payload);
  if (res.status() !== 201) {
    const text = await res.text().catch(() => '');
    throw new Error(`requestMoneyCodeAsDriver failed: HTTP ${res.status()} ${text.slice(0, 200)}`);
  }
  const body = expectContract(MoneyCodeSchema.strict(), await res.json());
  return { moneyCodeId: body.moneyCodeId, id: body.id };
}

test.describe('Fleet · Loads Money Codes @workflow', () => {
  const createdLoadIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
  });

  async function setupAssignedLoad(asDispatcher: RoleApiClient, asAdmin: RoleApiClient, authState: AuthState) {
    const setup = await createAssignedLoad(asDispatcher, asAdmin, {
      driverPublicId: seededDriverPublicId(authState),
    });
    createdLoadIds.push(setup.loadId);
    return setup;
  }

  // 1 ── POST /loads/:load_id/money-codes (driver request) ────────────
  test('POST /loads/:load_id/money-codes requests a lumper code as the assigned driver @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);

    const payload = buildMoneyCodeRequest({
      requestedCents: 32000,
      method: 'comchek',
      driverNote: 'QA lumper test — $320 firm at dock',
    });
    const res = await asDriver.post(`/loads/${setup.loadId}/money-codes`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(MoneyCodeSchema.strict(), await res.json(), 'POST /loads/:id/money-codes');

    // Semantic — service defaults on create: status=requested, amountCents
    // mirrors requestedCents, code is null, approvedAt/usedAt/expiresAt null.
    expect(body.loadId).toBe(setup.id);
    expect(body.status).toBe('requested');
    expect(body.method).toBe('comchek');
    expect(body.requestedCents).toBe(32000);
    expect(body.amountCents).toBe(32000);
    expect(body.code).toBeNull();
    expect(body.approvedAt).toBeNull();
    expect(body.usedAt).toBeNull();
    expect(body.expiresAt).toBeNull();
    expect(body.driverNote).toBe(payload.driverNote);
    expect(body.loadChargeId).toBeNull();
    expect(body.moneyCodeId.length).toBeGreaterThan(0);

    // Persistence — dispatcher list sees the new request.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/money-codes`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      moneyCodeId: string;
      status: string;
    }>;
    const row = items.find((m) => m.moneyCodeId === body.moneyCodeId);
    expect(row?.status).toBe('requested');
  });

  // 2 ── POST /loads/:load_id/money-codes/issue ───────────────────────
  test('POST /loads/:load_id/money-codes/issue proactively issues an approved code @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);

    const payload = buildMoneyCodeIssue({
      amountCents: 25000,
      method: 'comchek',
      dispatcherNote: 'Pre-issued for known $250 lumper facility',
      expiresInHours: 12,
    });
    const res = await asDispatcher.post(`/loads/${setup.loadId}/money-codes/issue`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(MoneyCodeSchema.strict(), await res.json(), 'POST /loads/:id/money-codes/issue');

    // Semantic — proactively issued codes skip `requested` and land
    // directly in `approved` with `code`, `approvedAt`, `expiresAt` set.
    expect(body.loadId).toBe(setup.id);
    expect(body.status).toBe('approved');
    expect(body.code).toBe(payload.code);
    expect(body.amountCents).toBe(25000);
    expect(body.requestedCents).toBe(25000);
    expect(body.method).toBe('comchek');
    expect(body.approvedAt).not.toBeNull();
    expect(body.expiresAt).not.toBeNull();
    expect(body.dispatcherNote).toBe(payload.dispatcherNote);

    // Persistence — list surfaces the new code.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/money-codes`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      moneyCodeId: string;
      status: string;
      code: string | null;
    }>;
    const row = items.find((m) => m.moneyCodeId === body.moneyCodeId);
    expect(row?.status).toBe('approved');
    expect(row?.code).toBe(payload.code);
  });

  // 3 ── GET /loads/:load_id/money-codes/insights ─────────────────────
  test('GET /loads/:load_id/money-codes/insights returns the Sally insights envelope @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);

    const res = await asDispatcher.get(`/loads/${setup.loadId}/money-codes/insights`);
    expect(res.status()).toBe(200);
    const insights = expectContract(
      MoneyCodeInsightsResponseSchema.strict(),
      await res.json(),
      'GET /loads/:id/money-codes/insights',
    );

    // Semantic — facilityName comes from the first delivery stop's Stop
    // row. Our factory seeds `name: 'QA Delivery Center'` as the delivery
    // stop, so facilityName should either be that string or null (if the
    // backend couldn't resolve a facility for some reason — e.g. Stop
    // dedup reused a bare row). Values themselves are data-dependent —
    // the shape is what we're pinning.
    expect(insights.facilityName === null || typeof insights.facilityName === 'string').toBe(true);
    expect(
      insights.facilityAvg === null ||
        (typeof insights.facilityAvg.avg === 'number' && typeof insights.facilityAvg.count === 'number'),
    ).toBe(true);
    expect(
      insights.driverHistory === null ||
        (typeof insights.driverHistory.count === 'number' && typeof insights.driverHistory.allMatched === 'boolean'),
    ).toBe(true);
  });

  // 4 ── GET /loads/:load_id/money-codes ──────────────────────────────
  test('GET /loads/:load_id/money-codes lists money codes in createdAt-desc order @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);

    // Two requested codes from the driver for ordering assertions.
    const first = await requestMoneyCodeAsDriver(asDriver, setup.loadId, {
      requestedCents: 15000,
      method: 'comchek',
      driverNote: 'first',
    });
    const second = await requestMoneyCodeAsDriver(asDriver, setup.loadId, {
      requestedCents: 22000,
      method: 'efs',
      driverNote: 'second',
    });

    const res = await asDispatcher.get(`/loads/${setup.loadId}/money-codes`);
    expect(res.status()).toBe(200);
    const raw = (await res.json()) as unknown;
    expect(Array.isArray(raw)).toBe(true);
    const list = raw as unknown[];
    const parsed = list.map((item, i) =>
      expectContract(MoneyCodeSchema.strict(), item, `GET /loads/:id/money-codes[${i}]`),
    );

    expect(parsed.length).toBeGreaterThanOrEqual(2);
    const ids = parsed.map((m) => m.moneyCodeId);
    expect(ids).toContain(first.moneyCodeId);
    expect(ids).toContain(second.moneyCodeId);

    // Ordering — service emits `orderBy: { createdAt: 'desc' }`.
    expect(ids.indexOf(second.moneyCodeId)).toBeLessThan(ids.indexOf(first.moneyCodeId));

    // Scope — every item belongs to this load.
    for (const item of parsed) {
      expect(item.loadId).toBe(setup.id);
    }
  });

  // 5 ── PATCH /loads/:load_id/money-codes/:id/approve ────────────────
  test('PATCH /loads/:load_id/money-codes/:id/approve transitions requested → approved @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);
    const mc = await requestMoneyCodeAsDriver(asDriver, setup.loadId, {
      requestedCents: 32000,
      method: 'comchek',
    });

    const approvePayload = {
      code: 'QA-APPROVE-4829',
      amountCents: 32000,
      dispatcherNote: 'QA approved at requested amount',
      expiresInHours: 24,
    };
    const res = await asDispatcher.patch(
      `/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/approve`,
      approvePayload,
    );
    expect(res.status()).toBe(200);
    const body = expectContract(MoneyCodeSchema.strict(), await res.json(), 'PATCH /money-codes/:id/approve');

    // Semantic — code/amount recorded, approvedAt + expiresAt set.
    expect(body.moneyCodeId).toBe(mc.moneyCodeId);
    expect(body.status).toBe('approved');
    expect(body.code).toBe(approvePayload.code);
    expect(body.amountCents).toBe(32000);
    expect(body.approvedAt).not.toBeNull();
    expect(body.expiresAt).not.toBeNull();
    expect(body.dispatcherNote).toBe(approvePayload.dispatcherNote);

    // Persistence — dispatcher list reflects the approved state + code.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/money-codes`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      moneyCodeId: string;
      status: string;
      code: string | null;
    }>;
    const row = items.find((m) => m.moneyCodeId === mc.moneyCodeId);
    expect(row?.status).toBe('approved');
    expect(row?.code).toBe(approvePayload.code);

    // Re-approve of an already-approved code → 400 (no transition).
    const againRes = await asDispatcher.patch(
      `/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/approve`,
      approvePayload,
    );
    expect(againRes.status()).toBe(400);
  });

  // 6 ── PATCH /loads/:load_id/money-codes/:id/deny ───────────────────
  test('PATCH /loads/:load_id/money-codes/:id/deny transitions requested → denied @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);
    const mc = await requestMoneyCodeAsDriver(asDriver, setup.loadId, {
      requestedCents: 50000,
      method: 'efs',
    });

    const res = await asDispatcher.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/deny`, {
      dispatcherNote: 'QA deny — above approval threshold',
    });
    expect(res.status()).toBe(200);
    const body = expectContract(MoneyCodeSchema.strict(), await res.json(), 'PATCH /money-codes/:id/deny');

    // Semantic — denied state + dispatcher note captured. `code` stays
    // null (nothing was issued). `approvedAt` IS set by the service
    // (service re-uses the column for the decision timestamp), and
    // `usedAt`/`expiresAt` remain null.
    expect(body.status).toBe('denied');
    expect(body.dispatcherNote).toBe('QA deny — above approval threshold');
    expect(body.code).toBeNull();
    expect(body.usedAt).toBeNull();
    expect(body.expiresAt).toBeNull();

    // Persistence — dispatcher list reflects denied state.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/money-codes`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      moneyCodeId: string;
      status: string;
    }>;
    const row = items.find((m) => m.moneyCodeId === mc.moneyCodeId);
    expect(row?.status).toBe('denied');

    // Re-deny → 400 (denied is terminal).
    const againRes = await asDispatcher.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/deny`, {});
    expect(againRes.status()).toBe(400);
  });

  // 7 ── PATCH /loads/:load_id/money-codes/:id/use ────────────────────
  test('PATCH /loads/:load_id/money-codes/:id/use marks an approved code as used and attaches a LoadCharge @workflow @destructive @slow', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);
    const mc = await requestMoneyCodeAsDriver(asDriver, setup.loadId, {
      requestedCents: 32000,
      method: 'comchek',
    });

    // Approve first — `use` only transitions out of `approved`.
    const approveRes = await asDispatcher.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/approve`, {
      code: 'QA-USE-7712',
      amountCents: 32000,
      expiresInHours: 24,
    });
    expect(approveRes.status()).toBe(200);

    // Driver marks it used with the actual receipt amount.
    const res = await asDriver.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/use`, {
      actualAmountCents: 31500,
    });
    expect(res.status()).toBe(200);
    const body = expectContract(MoneyCodeSchema.strict(), await res.json(), 'PATCH /money-codes/:id/use');

    // Semantic — status used, usedAt set, loadChargeId linked inside the
    // service transaction. `amountCents` stays at the approved value;
    // `actualAmountCents` feeds the LoadCharge, not back into the mc row.
    expect(body.status).toBe('used');
    expect(body.usedAt).not.toBeNull();
    expect(body.loadChargeId).not.toBeNull();
    expect(body.code).toBe('QA-USE-7712');

    // Persistence — the linked lumper LoadCharge shows up on the load.
    const chargesRes = await asDispatcher.get(`/loads/${setup.loadId}/charges`);
    expect(chargesRes.status()).toBe(200);
    const charges = (await chargesRes.json()) as Array<{
      id: number;
      chargeType: string;
      totalCents: number;
    }>;
    const lumper = charges.find((c) => c.id === body.loadChargeId);
    expect(lumper).toBeDefined();
    expect(lumper?.chargeType).toBe('lumper');
    expect(lumper?.totalCents).toBe(31500);

    // Re-use of a used code → 400 (used is terminal).
    const againRes = await asDriver.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/use`, {
      actualAmountCents: 31500,
    });
    expect(againRes.status()).toBe(400);
  });

  // 8 ── PATCH /loads/:load_id/money-codes/:id/cancel ─────────────────
  test('PATCH /loads/:load_id/money-codes/:id/cancel moves requested → cancelled as dispatcher @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    const setup = await setupAssignedLoad(asDispatcher, asAdmin, authState);
    const mc = await requestMoneyCodeAsDriver(asDriver, setup.loadId, {
      requestedCents: 18000,
      method: 'cash',
    });

    const res = await asDispatcher.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/cancel`, {});
    expect(res.status()).toBe(200);
    const body = expectContract(MoneyCodeSchema.strict(), await res.json(), 'PATCH /money-codes/:id/cancel');

    // Semantic — cancelled state, same moneyCodeId, no charge created.
    expect(body.moneyCodeId).toBe(mc.moneyCodeId);
    expect(body.status).toBe('cancelled');
    expect(body.loadChargeId).toBeNull();

    // Persistence — list reflects cancelled state.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/money-codes`);
    expect(listRes.status()).toBe(200);
    const items = (await listRes.json()) as Array<{
      moneyCodeId: string;
      status: string;
    }>;
    const row = items.find((m) => m.moneyCodeId === mc.moneyCodeId);
    expect(row?.status).toBe('cancelled');

    // Re-cancel → 400 (cancelled is terminal).
    const againRes = await asDispatcher.patch(`/loads/${setup.loadId}/money-codes/${mc.moneyCodeId}/cancel`, {});
    expect(againRes.status()).toBe(400);
  });
});
