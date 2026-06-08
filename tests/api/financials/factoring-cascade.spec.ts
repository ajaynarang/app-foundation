/**
 * Factoring cascade · customer-type-aware factoring (SQ-20).
 *
 * Covers SQ-20 acceptance criteria #1 + #2:
 *
 *   1. **Carrier customers cannot have factoring overrides.**
 *      POST/PATCH /customers with `customerType: CARRIER` + factoring fields
 *      → 400. (Sally's model: factoring lives on the bill-to side; outside
 *      carriers are the pay-to side.)
 *
 *   2. **Broker/Shipper/3PL can have factoring overrides.**
 *      Customer-level `defaultFactoringCompanyId` round-trips through GET/POST.
 *
 * AC#3 (invoice cascade snapshot) is verified via the existing
 * `invoices-crud.spec.ts` and the cascade implementation in
 * `invoicing.service.ts:206-218` — generating a delivered load + invoice
 * fresh in this spec collides with the seeded-customer assumption in the
 * shared `createInvoiceableLoad` helper.
 *
 * Test-data discipline: every customer + factoring company is created
 * in-test and torn down in afterEach. The Northstar tenant carries 70+
 * orphan "QA Factoring FC-test-…" rows from prior runs that didn't
 * clean up — don't add to the pile.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildFactoringCompany } from '@sally/test-utils/factories';
import type { RoleApiClient } from '@sally/test-utils/playwright';

interface SeededCompany {
  companyId: string;
  id: number;
}

async function seedCompany(api: RoleApiClient): Promise<SeededCompany> {
  const res = await api.post('/invoices/factoring-companies', buildFactoringCompany());
  expect(res.status(), 'seedCompany expects 201').toBe(201);
  const row = (await res.json()) as SeededCompany;
  return { companyId: row.companyId, id: row.id };
}

async function createCustomer(
  api: RoleApiClient,
  payload: Record<string, unknown>,
): Promise<{ customerId: string; id: number; companyName: string }> {
  const res = await api.post('/customers', payload);
  expect(res.status(), `POST /customers payload=${JSON.stringify(payload)}`).toBe(201);
  return (await res.json()) as { customerId: string; id: number; companyName: string };
}

test.describe('Factoring cascade · customer-type-aware factoring · SQ-20 @workflow', () => {
  const createdCompanyPublicIds: string[] = [];
  const createdCustomerPublicIds: string[] = [];

  test.afterEach(async ({ asAdmin }) => {
    for (const customerId of createdCustomerPublicIds.splice(0)) {
      await asAdmin.delete(`/customers/${customerId}`).catch(() => undefined);
    }
    for (const companyId of createdCompanyPublicIds.splice(0)) {
      await asAdmin.delete(`/invoices/factoring-companies/${companyId}`).catch(() => undefined);
    }
  });

  // ─── AC#1 — CARRIER GUARD ──────────────────────────────────────────────

  test('POST /customers CARRIER + defaultFactoringCompanyId returns 400 @destructive', async ({ asAdmin }) => {
    const factor = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(factor.companyId);

    const res = await asAdmin.post('/customers', {
      companyName: `QA SQ-20 Carrier With Factor ${Date.now()}`,
      customerType: 'CARRIER',
      defaultBillingPath: 'FACTORED',
      defaultFactoringCompanyId: factor.id,
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Outside carriers cannot have factoring overrides/i);
  });

  test('POST /customers CARRIER without factoring fields succeeds @destructive', async ({ asAdmin }) => {
    const carrier = await createCustomer(asAdmin, {
      companyName: `QA SQ-20 Carrier No Factor ${Date.now()}`,
      customerType: 'CARRIER',
    });
    createdCustomerPublicIds.push(carrier.customerId);

    const get = await asAdmin.get(`/customers/${carrier.customerId}`);
    expect(get.status()).toBe(200);
    const row = (await get.json()) as Record<string, unknown>;
    expect(row.customerType).toBe('CARRIER');
    expect(row.defaultFactoringCompanyId).toBeNull();
    expect(row.defaultBillingPath).toBeNull();
  });

  test('PUT /customers/:id rejects setting factoring on an existing CARRIER @destructive', async ({ asAdmin }) => {
    const factor = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(factor.companyId);

    const carrier = await createCustomer(asAdmin, {
      companyName: `QA SQ-20 Carrier Update ${Date.now()}`,
      customerType: 'CARRIER',
    });
    createdCustomerPublicIds.push(carrier.customerId);

    const putRes = await asAdmin.put(`/customers/${carrier.customerId}`, {
      companyName: carrier.companyName,
      defaultBillingPath: 'FACTORED',
      defaultFactoringCompanyId: factor.id,
    });
    expect(putRes.status()).toBe(400);
  });

  // ─── AC#2 — BROKER/SHIPPER/3PL can hold overrides ──────────────────────

  for (const type of ['BROKER', 'SHIPPER', 'THREE_PL'] as const) {
    test(`POST /customers ${type} + factoring override round-trips @destructive`, async ({ asAdmin }) => {
      const factor = await seedCompany(asAdmin);
      createdCompanyPublicIds.push(factor.companyId);

      const customer = await createCustomer(asAdmin, {
        companyName: `QA SQ-20 ${type} With Override ${Date.now()}`,
        customerType: type,
        defaultBillingPath: 'FACTORED',
        defaultFactoringCompanyId: factor.id,
      });
      createdCustomerPublicIds.push(customer.customerId);

      const get = await asAdmin.get(`/customers/${customer.customerId}`);
      expect(get.status()).toBe(200);
      const row = (await get.json()) as Record<string, unknown>;
      expect(row.customerType).toBe(type);
      expect(row.defaultFactoringCompanyId).toBe(factor.id);
      expect(row.defaultBillingPath).toBe('FACTORED');
    });
  }

  test('POST /customers BROKER without factoring leaves cascade to fall through @destructive', async ({ asAdmin }) => {
    const broker = await createCustomer(asAdmin, {
      companyName: `QA SQ-20 Broker No Override ${Date.now()}`,
      customerType: 'BROKER',
    });
    createdCustomerPublicIds.push(broker.customerId);

    const get = await asAdmin.get(`/customers/${broker.customerId}`);
    expect(get.status()).toBe(200);
    const row = (await get.json()) as Record<string, unknown>;
    expect(row.customerType).toBe('BROKER');
    expect(row.defaultFactoringCompanyId).toBeNull();
    expect(row.defaultBillingPath).toBeNull();
  });
});
