/**
 * Tenant-level factoring default — Phase 1 of the factoring overhaul.
 *
 * Endpoints:
 *   • GET    /tenants/me/settings              — DISPATCHER + ADMIN + OWNER
 *   • PATCH  /tenants/me/factoring-default     — DISPATCHER + ADMIN + OWNER
 *
 * Background: `FactoringCompany.isDefault` was dropped; tenant default lives
 * on `Tenant.defaultFactoringCompanyId` and is mutated through the new pin
 * endpoint. See `.docs/plans/03-financials/2026-04-28-tenant-factoring-default-design.md`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildFactoringCompany } from '@sally/test-utils/factories';
import { z } from 'zod';

const TenantSettingsSchema = z
  .object({
    factoringCompanyId: z.number().nullable(),
    factoringCompany: z.object({ id: z.number(), companyId: z.string(), companyName: z.string() }).nullable(),
    bundleFormat: z.enum(['ZIP', 'MERGED_PDF']),
    driverPayTiming: z.enum(['ON_DELIVERY', 'ON_FACTOR_FUND']),
  })
  .strict();

test.describe('Tenant factoring default · pin/unpin · @workflow', () => {
  const createdPublicIds: string[] = [];

  test.afterEach(async ({ asAdmin }) => {
    // Always unpin so we don't leak state across tests, then drop seeded rows.
    await asAdmin.patch('/tenants/me/factoring-default', { factoringCompanyId: null }).catch(() => undefined);
    for (const companyId of createdPublicIds.splice(0)) {
      await asAdmin.delete(`/invoices/factoring-companies/${companyId}`).catch(() => undefined);
    }
  });

  test('PATCH /tenants/me/factoring-default pins a company in the same tenant @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const createRes = await asAdmin.post('/invoices/factoring-companies', buildFactoringCompany());
    expect(createRes.status()).toBe(201);
    const company = await createRes.json();
    createdPublicIds.push(company.companyId);

    const pinRes = await asDispatcher.patch('/tenants/me/factoring-default', { factoringCompanyId: company.id });
    expect(pinRes.status()).toBe(200);
    const pinBody = await pinRes.json();
    expect(pinBody.factoringCompanyId).toBe(company.id);

    const settingsRes = await asDispatcher.get('/tenants/me/settings');
    expect(settingsRes.status()).toBe(200);
    const settings = TenantSettingsSchema.parse(await settingsRes.json());
    expect(settings.factoringCompanyId).toBe(company.id);
    expect(settings.factoringCompany?.companyId).toBe(company.companyId);
  });

  test('PATCH /tenants/me/factoring-default with null unpins @destructive', async ({ asAdmin, asDispatcher }) => {
    const company = await asAdmin.post('/invoices/factoring-companies', buildFactoringCompany()).then((r) => r.json());
    createdPublicIds.push(company.companyId);
    await asDispatcher.patch('/tenants/me/factoring-default', { factoringCompanyId: company.id });

    const unpinRes = await asDispatcher.patch('/tenants/me/factoring-default', { factoringCompanyId: null });
    expect(unpinRes.status()).toBe(200);

    const settings = TenantSettingsSchema.parse(await (await asDispatcher.get('/tenants/me/settings')).json());
    expect(settings.factoringCompanyId).toBeNull();
    expect(settings.factoringCompany).toBeNull();
  });

  test('PATCH /tenants/me/factoring-default with a non-existent id returns 404', async ({ asDispatcher }) => {
    const res = await asDispatcher.patch('/tenants/me/factoring-default', { factoringCompanyId: 999_999 });
    expect(res.status()).toBe(404);
  });

  test('PATCH /tenants/me/factoring-default forbids non-DISPATCHER/ADMIN/OWNER roles', async ({ asDriver }) => {
    const res = await asDriver.patch('/tenants/me/factoring-default', { factoringCompanyId: null });
    expect(res.status()).toBe(403);
  });
});
