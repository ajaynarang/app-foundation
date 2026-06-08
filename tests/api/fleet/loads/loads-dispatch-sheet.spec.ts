/**
 * Fleet — Loads Dispatch Sheet API (Phase 1 Group 8a)
 *
 * Covers the dispatch-sheet endpoints on `LoadsController`:
 *
 *   - GET  /loads/:load_id/dispatch-sheet/pdf                       → PDF (non-relay)
 *   - POST /loads/:load_id/dispatch-sheet/send                      → email envelope
 *   - GET  /loads/:load_id/legs/:leg_id/dispatch-sheet/pdf          → PDF (relay leg)
 *   - POST /loads/:load_id/legs/:leg_id/dispatch-sheet/send         → email envelope
 *
 * The two PDF endpoints return binary (application/pdf) — NOT JSON. We
 * assert the response's `Content-Type` + `Content-Disposition` headers and
 * the body length (a real `%PDF-` document is > 1KB after `pdfkit` stamps
 * company header + stops table). We do not parse the PDF itself; that's
 * the renderer's concern, not the controller's contract.
 *
 * Role rules:
 *   - GET pdf endpoints: DISPATCHER/ADMIN/OWNER/DRIVER. We exercise
 *     DISPATCHER — it's the canonical back-office caller. Driver RBAC is
 *     covered in the operations suite.
 *   - POST send endpoints: DISPATCHER/ADMIN/OWNER — need an assigned driver
 *     with an email on file. The Samsara-synced demo drivers on
 *     demo-northstar can have null `email` (finding #14), so the send
 *     tests must NOT reuse the seeded DRIVER row. They instead provision
 *     a fresh driver via `createAssignedLoad` without `driverPublicId`
 *     — the `buildDriver` factory always emits `email: driver-<uid>@test.sally.dev`,
 *     which `POST /drivers` persists verbatim on the Driver row.
 *
 * Plan gating: the relay-leg tests (#3, #4) require a relay load for
 * setup. Creating a relay load goes through PATCH isRelay → POST /legs,
 * both gated on `FEATURE_KEYS.RELAY_LOADS`. Tag those tests
 * `@requires:plan-relay_loads` — they are excluded at collection time on
 * tenants without the feature (see `detect-capabilities.ts`). The
 * non-relay tests (#1, #2) are plan-agnostic.
 *
 * Email delivery: the controller dispatches via Resend when
 * `RESEND_API_KEY` is set. Locally the key is unset and the service
 * short-circuits to `{ sent: false, sentTo: driverEmail }`. The test
 * asserts only the envelope shape — it does NOT block on actual email
 * delivery.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildDriver } from '@sally/test-utils/factories';
import { cleanupLoad, createRelayLoadWithLegs } from '@sally/test-utils/helpers';
import { expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { createAssignedLoad, firstCustomerId } from './_helpers.js';

/** Provision a fresh Driver via `asAdmin` with bounded retry (finding #2 —
 *  driverId public-id collisions under parallel workers return 409; factory
 *  regen yields a new id). Returns the driver's STRING public id. Caller
 *  is responsible for deactivation cleanup. */
async function provisionDriver(asAdmin: RoleApiClient): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await asAdmin.post('/drivers', buildDriver());
    if (res.status() === 201) {
      const driver = (await res.json()) as { driverId: string };
      return driver.driverId;
    }
    if (res.status() !== 409) {
      const body = await res.text().catch(() => '');
      throw new Error(`provisionDriver: POST /drivers → HTTP ${res.status()}${body ? `: ${body}` : ''}`);
    }
  }
  throw new Error('provisionDriver: POST /drivers returned 409 three times (driverId collision — finding #2)');
}

const { DispatchSheetSendResponseSchema } = LoadSubresourceSchemas;

// Minimum byte length we expect from a fully-rendered dispatch-sheet PDF.
// Empirically pdfkit output with company header + stops table + driver
// info runs > 2KB; we assert a floor of 1 KiB to give headroom for
// template tweaks while still catching "empty buffer" regressions.
const PDF_MIN_BYTES = 1024;

test.describe('Fleet · Loads Dispatch Sheet @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    // Load-level endpoints use assigned loads (PENDING → ASSIGNED) so
    // DELETE returns 400. Cleanup is best-effort — the tenant-reset
    // script is the hard reset between CI runs.
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── GET /loads/:load_id/dispatch-sheet/pdf ─────────────────────
  test('GET /loads/:load_id/dispatch-sheet/pdf returns a rendered PDF binary for an assigned non-relay load @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Fresh driver provisioned by `createAssignedLoad` — the PDF endpoint
    // does not require an email, but isolating from the shared seeded
    // DRIVER row keeps parallel workers independent (the seeded row can
    // land in IN_TRANSIT state from other tests and block assignment).
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.get(`/loads/${setup.loadId}/dispatch-sheet/pdf`);
    expect(res.status()).toBe(200);

    // Contract — headers.
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain(`dispatch-sheet-${setup.loadNumber}.pdf`);

    // Contract — body is a non-empty PDF. We assert the `%PDF-` magic
    // bytes so a regression to "empty buffer" or "JSON error" is
    // impossible to miss, plus a size floor.
    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 2 ── POST /loads/:load_id/dispatch-sheet/send ───────────────────
  test('POST /loads/:load_id/dispatch-sheet/send returns the email envelope when the assigned driver has an email @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Fresh driver (not seeded) — `buildDriver` populates an email field
    // that POST /drivers persists verbatim. The Samsara-synced demo
    // drivers can have null `email` (see spec-header finding #14), which
    // would trip the controller's "Driver has no email on file" guard.
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const res = await asDispatcher.post(`/loads/${setup.loadId}/dispatch-sheet/send`, {});
    // NestJS defaults to 201 for `@Post()` without a custom status; the
    // service returns a JSON envelope.
    expect(res.status()).toBe(201);
    const body = expectContract(
      DispatchSheetSendResponseSchema.strict(),
      await res.json(),
      'POST /loads/:id/dispatch-sheet/send',
    );

    // Semantic — `sent` is a boolean (true when RESEND_API_KEY is
    // configured, false in local dev — both valid per the service
    // implementation). `sentTo` is the assigned driver's email string.
    expect(typeof body.sent).toBe('boolean');
    expect(body.sentTo).toContain('@');
  });

  // 3 ── GET /loads/:load_id/legs/:leg_id/dispatch-sheet/pdf ────────
  test('GET /loads/:load_id/legs/:leg_id/dispatch-sheet/pdf returns a rendered PDF for a relay leg @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);
    expect(legs.length).toBeGreaterThanOrEqual(2);
    const legId = legs[0].legId;

    const res = await asDispatcher.get(`/loads/${load.loadId}/legs/${legId}/dispatch-sheet/pdf`);
    expect(res.status()).toBe(200);

    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('application/pdf');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain(`dispatch-sheet-${load.loadNumber}.pdf`);

    const body = await res.body();
    expect(body.length).toBeGreaterThan(PDF_MIN_BYTES);
    expect(body.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  // 4 ── POST /loads/:load_id/legs/:leg_id/dispatch-sheet/send ──────
  test('POST /loads/:load_id/legs/:leg_id/dispatch-sheet/send emails the driver assigned to that leg @workflow @destructive @requires:plan-relay_loads', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const { load, legs } = await createRelayLoadWithLegs(asDispatcher, customerId);
    createdLoadIds.push(load.loadId);
    expect(legs.length).toBeGreaterThanOrEqual(2);

    // Send requires leg.driver.email. Provision a fresh driver (factory
    // `buildDriver` includes an email) — Samsara-synced demo drivers may
    // have null email (finding #14) and the controller 400s on that.
    const driverPublicId = await provisionDriver(asAdmin);
    createdDriverIds.push(driverPublicId);
    const assignRes = await asDispatcher.patch(`/loads/${load.loadId}/legs/${legs[0].legId}/assign`, {
      driverId: driverPublicId,
    });
    expect(assignRes.status()).toBe(200);

    const res = await asDispatcher.post(`/loads/${load.loadId}/legs/${legs[0].legId}/dispatch-sheet/send`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      DispatchSheetSendResponseSchema.strict(),
      await res.json(),
      'POST /loads/:id/legs/:leg_id/dispatch-sheet/send',
    );

    expect(typeof body.sent).toBe('boolean');
    expect(body.sentTo).toContain('@');
  });
});
