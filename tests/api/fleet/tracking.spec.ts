/**
 * Fleet — Public Load Tracking API (Phase 1 Group 3)
 *
 * Covers one endpoint:
 *   - GET /tracking/:token   (Public — no auth required)
 *
 * Verifies the full happy-path:
 *   1. DISPATCHER creates a load (requires a real customer linked to the
 *      tenant, so we discover one via GET /customers).
 *   2. DISPATCHER issues a tracking token via
 *      `POST /loads/:load_id/tracking-token`.
 *   3. ANONYMOUS (no token) fetches `GET /tracking/:token` and receives the
 *      snake_case public tracking envelope.
 *   4. Cleanup via `cleanupLoad` in afterEach.
 *
 * Schema source: hand-written in
 * `packages/test-utils/src/schemas/tracking.ts`. The public response is
 * intentionally snake_case (public tracking contract) and is captured as-is.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoad } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectContract, TrackingSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';

const { TrackingTokenResponseSchema, PublicTrackingSchema } = TrackingSchemas;

/** Find an existing customer the dispatcher can link a new load to. */
async function firstCustomerId(api: RoleApiClient): Promise<number> {
  const res = await api.get('/customers');
  expect(res.status()).toBe(200);
  const body: unknown = await res.json();
  const items = Array.isArray(body)
    ? (body as Array<{ id: number }>)
    : ((body as { data?: Array<{ id: number }> }).data ?? []);
  if (items.length === 0) {
    throw new Error('GET /customers returned 0 customers — tracking test requires a seeded customer');
  }
  return items[0].id;
}

test.describe('Fleet · Tracking @workflow', () => {
  const createdLoadIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
  });

  test('GET /tracking/:token returns public load info (no auth) @workflow @destructive', async ({
    asDispatcher,
    asAnonymous,
  }) => {
    // Step 1 — create a load linked to a real customer on this tenant.
    const customerId = await firstCustomerId(asDispatcher);
    const payload = buildLoad(customerId);
    const createRes = await asDispatcher.post('/loads', payload);
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as {
      loadId: string;
      loadNumber: string;
      status: string;
    };
    expect(created.loadId).toBeTruthy();
    createdLoadIds.push(created.loadId);

    // Step 2 — issue a tracking token.
    const tokenRes = await asDispatcher.post(`/loads/${created.loadId}/tracking-token`);
    expect(tokenRes.status()).toBe(201);
    const tokenBody = expectContract(
      TrackingTokenResponseSchema,
      await tokenRes.json(),
      'POST /loads/:id/tracking-token',
    );
    // Semantic: backend formats token as `<loadNumber>-<hex>`.
    expect(tokenBody.trackingToken.startsWith(created.loadNumber)).toBe(true);
    expect(tokenBody.trackingUrl).toBe(`/track/${tokenBody.trackingToken}`);

    // Step 3 — anonymous GET /tracking/:token returns the public envelope.
    const pubRes = await asAnonymous.get(`/tracking/${encodeURIComponent(tokenBody.trackingToken)}`);
    expect(pubRes.status()).toBe(200);
    const pub = expectContract(PublicTrackingSchema, await pubRes.json(), 'GET /tracking/:token');

    // Semantic: envelope reflects the load we just created.
    expect(pub.loadNumber).toBe(created.loadNumber);
    expect(pub.status).toBe(created.status);
    expect(pub.customerName).toBe(payload.customerName);
    expect(pub.weightLbs).toBe(payload.weightLbs);
    expect(pub.equipmentType).toBe(payload.requiredEquipmentType);
    // Stops echo the pickup/delivery cities from our payload.
    const cities = pub.stops.map((s) => s.city);
    expect(cities).toContain('Dallas');
    expect(cities).toContain('Houston');
    // Timeline always includes the initial order-confirmed event.
    expect(pub.timeline.length).toBeGreaterThan(0);
    expect(pub.timeline[0].event).toBe('Order Confirmed');

    // Persistence: a second anonymous fetch returns the same envelope
    // (idempotent read path).
    const secondRes = await asAnonymous.get(`/tracking/${encodeURIComponent(tokenBody.trackingToken)}`);
    expect(secondRes.status()).toBe(200);
    const second = expectContract(PublicTrackingSchema, await secondRes.json());
    expect(second.loadNumber).toBe(created.loadNumber);
  });
});
