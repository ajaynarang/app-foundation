/**
 * Fleet — Customer Portal Loads API (Phase 1 Group 3)
 *
 * Covers 3 endpoints on CustomerLoadsController:
 *   - GET  /customer/loads              — list loads for the authenticated customer
 *   - GET  /customer/loads/:load_id     — detail for one customer-owned load
 *   - POST /customer/loads/request      — submit a load request (draft)
 *
 * Role rules: every endpoint is `@Roles(CUSTOMER)` — we use the `asCustomer`
 * fixture. The controller short-circuits with `403 "No customer account
 * linked"` when `req.user.customerId` is null.
 *
 * Data gate: all three tests require the CUSTOMER-role user on the target
 * tenant to be linked to a Customer record. Tagged `@requires:data-customer-linked`;
 * excluded from collection on tenants where the link is absent (see
 * `tests/config/detect-capabilities.ts` and `TESTS_DATA_CAPABILITIES` env var).
 *
 * Schema source: hand-written in
 * `packages/test-utils/src/schemas/customer-loads.ts`. shared-types
 * `CustomerLoadSchema` / `CustomerLoadDetailSchema` drift from reality
 * (optional vs nullable; detail returns full dispatcher envelope via
 * `formatLoadResponse`). Rationale documented in the schema file.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildCustomerLoadRequest } from '@sally/test-utils/factories';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { expectContract, expectArrayContract, CustomerLoadSchemas } from '@sally/test-utils/schemas';

const { CustomerLoadListItemSchema, CustomerLoadDetailSchema } = CustomerLoadSchemas;

const VISIBLE_STATUSES = new Set(['ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'ON_HOLD', 'CANCELLED']);

test.describe('Fleet · Customer Loads @workflow', () => {
  const createdLoadIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
  });

  test('GET /customer/loads returns customer-visible loads @workflow @requires:data-customer-linked', async ({
    asCustomer,
  }) => {
    const res = await asCustomer.get('/customer/loads');
    expect(res.status()).toBe(200);

    const items = expectArrayContract(CustomerLoadListItemSchema, await res.json(), {
      allowEmpty: true,
      context: 'GET /customer/loads',
    });
    for (const load of items) {
      expect(VISIBLE_STATUSES.has(load.status)).toBe(true);
      expect(load.loadId).toBeTruthy();
      expect(load.loadNumber).toBeTruthy();
    }
  });

  test('GET /customer/loads/:load_id returns load detail @workflow @requires:data-customer-linked', async ({
    asCustomer,
  }) => {
    const listRes = await asCustomer.get('/customer/loads');
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(CustomerLoadListItemSchema, await listRes.json(), {
      allowEmpty: true,
      context: 'GET /customer/loads (seed discovery)',
    });

    if (list.length === 0) {
      // Linked but no visible loads — at least validate the 404 path for the
      // detail endpoint so the test still exercises the controller.
      const missingRes = await asCustomer.get('/customer/loads/LOAD-DOES-NOT-EXIST');
      expect(missingRes.status()).toBe(404);
      return;
    }

    const target = list[0];
    const res = await asCustomer.get(`/customer/loads/${target.loadId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(CustomerLoadDetailSchema, await res.json(), 'GET /customer/loads/:load_id');
    expect(detail.loadId).toBe(target.loadId);
    expect(detail.loadNumber).toBe(target.loadNumber);
    expect(detail.status).toBe(target.status);
    expect(Array.isArray(detail.stops)).toBe(true);

    const missingRes = await asCustomer.get('/customer/loads/LOAD-DOES-NOT-EXIST-XYZ');
    expect(missingRes.status()).toBe(404);
  });

  test('POST /customer/loads/request creates a draft load @workflow @destructive @requires:data-customer-linked', async ({
    asCustomer,
    asDispatcher,
  }) => {
    const payload = buildCustomerLoadRequest();
    const res = await asCustomer.post('/customer/loads/request', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(CustomerLoadDetailSchema, await res.json(), 'POST /customer/loads/request');
    expect(body.status).toBe('DRAFT');
    expect(body.loadId).toBeTruthy();
    expect(body.weightLbs).toBe(payload.weightLbs);
    expect(body.commodityType).toBe(payload.commodityType);
    createdLoadIds.push(body.loadId);

    // Persistence: the dispatcher can see the draft via the internal loads
    // endpoint. Customers cannot see DRAFT — see the visible-statuses filter
    // in `CustomerLoadService.findByCustomerId`.
    const followUp = await asDispatcher.get(`/loads/${body.loadId}`);
    expect(followUp.status()).toBe(200);
  });
});
