/**
 * Financials — Factoring Companies + Contacts + NOA Records (Phase 2 Group 2c).
 *
 * Covers 12 endpoints on `InvoicingController`:
 *
 *   Factoring companies (company_id = string public id, `fc_<12-hex>`):
 *     1.  GET    /invoices/factoring-companies                     — asDispatcher
 *     2.  POST   /invoices/factoring-companies                     — asAdmin
 *     3.  PATCH  /invoices/factoring-companies/:company_id         — asAdmin
 *     4.  DELETE /invoices/factoring-companies/:company_id         — asAdmin
 *
 *   Factoring contacts (companyId in list/create = Prisma numeric id):
 *     5.  GET    /invoices/factoring-companies/:companyId/contacts — asDispatcher
 *     6.  POST   /invoices/factoring-companies/:companyId/contacts — asDispatcher
 *     7.  PATCH  /invoices/factoring-contacts/:contactId           — asDispatcher
 *     8.  DELETE /invoices/factoring-contacts/:contactId           — asDispatcher
 *
 *   NOA records (noa_id = string public id, `noa_<12-hex>`):
 *     9.  GET    /invoices/noa-records                             — asDispatcher
 *    10.  POST   /invoices/noa-records                             — asAdmin
 *    11.  PATCH  /invoices/noa-records/:noa_id/status              — asAdmin
 *    12.  DELETE /invoices/noa-records/:noa_id                     — asAdmin
 *
 * Plan-doc count adjustment: the plan document lists "9 tests" / "11 tests"
 * for this file under varying sections. Live enumeration on the controller
 * finds 12 distinct endpoints — one test per endpoint, 12 tests total.
 *
 * Self-provisioning: every factoring company, contact, and NOA row is
 * created in-test. Cleanup in `afterEach` hard-deletes companies (only
 * after their contacts + NOA records are removed, per service FK guard) so
 * neither a passing nor a failing run pollutes the tenant between runs.
 *
 * Why NOT `@requires:data-factoring-linked` here: these tests own the
 * fixture — they create the factoring company in setup. The tag only
 * protects tests that assume a pre-seeded factoring link (like
 * `invoices-batch.spec.ts` #6 + #7).
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildFactoringCompany,
  buildFactoringCompanyUpdate,
  buildFactoringContact,
  buildNoaRecord,
  buildNoaStatusUpdate,
} from '@sally/test-utils/factories';
import { expectContract, FactoringSchemas } from '@sally/test-utils/schemas';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { firstCustomerId } from './_helpers.js';

const {
  FactoringCompanySchema,
  FactoringCompanyListResponseSchema,
  FactoringCompanyDeleteResponseSchema,
  FactoringContactSchema,
  FactoringContactListResponseSchema,
  NoaRecordSchema,
  NoaRecordListResponseSchema,
  NoaRecordDeleteResponseSchema,
} = FactoringSchemas;

// ── In-test fixture helpers ───────────────────────────────────────────────────

interface SeededCompany {
  /** String public id (`fc_<12-hex>`) — used by all PATCH/DELETE routes. */
  companyId: string;
  /** Numeric Prisma id — used by list/create contacts routes. */
  id: number;
}

async function seedCompany(
  api: RoleApiClient,
  overrides: Parameters<typeof buildFactoringCompany>[0] = {},
): Promise<SeededCompany> {
  const res = await api.post('/invoices/factoring-companies', buildFactoringCompany(overrides));
  if (res.status() !== 201) {
    const body = await res.text().catch(() => '');
    throw new Error(`seedCompany: POST /invoices/factoring-companies → HTTP ${res.status()} ${body.slice(0, 240)}`);
  }
  const row = expectContract(FactoringCompanySchema.strict(), await res.json());
  return { companyId: row.companyId, id: row.id };
}

test.describe('Financials · Factoring Companies · Contacts · NOA Records @workflow', () => {
  /** Every company created by a test — hard-deleted in afterEach (after contacts/NOAs cleared). */
  const createdCompanyPublicIds: string[] = [];
  /** Every NOA created by a test — deleted before companies so the FK guard doesn't 400. */
  const createdNoaPublicIds: string[] = [];
  /** Every contact created — soft-deleted (service sets status=INACTIVE). */
  const createdContactPublicIds: string[] = [];

  test.afterEach(async ({ asAdmin, asDispatcher }) => {
    // Order matters: NOAs + contacts first (they reference the company),
    // then companies. `deleteCompany` service aborts with 400 when any
    // invoice or NOA row still references it.
    for (const noaId of createdNoaPublicIds.splice(0)) {
      await asAdmin.delete(`/invoices/noa-records/${noaId}`).catch(() => undefined);
    }
    for (const contactId of createdContactPublicIds.splice(0)) {
      await asDispatcher.delete(`/invoices/factoring-contacts/${contactId}`).catch(() => undefined);
    }
    for (const companyId of createdCompanyPublicIds.splice(0)) {
      await asAdmin.delete(`/invoices/factoring-companies/${companyId}`).catch(() => undefined);
    }
  });

  // ── 1 ── GET /invoices/factoring-companies ─────────────────────────
  test('GET /invoices/factoring-companies returns every factoring row on the tenant @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    // Seed one so we know the list is non-empty regardless of tenant state.
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const res = await asDispatcher.get('/invoices/factoring-companies');
    expect(res.status()).toBe(200);
    const list = expectContract(
      FactoringCompanyListResponseSchema,
      await res.json(),
      'GET /invoices/factoring-companies',
    );
    expect(list.length).toBeGreaterThan(0);

    // Semantic: our seeded row must appear by public id.
    const match = list.find((c) => c.companyId === seeded.companyId);
    expect(match).toBeDefined();
    // Per-row contract check.
    expectContract(FactoringCompanySchema.strict(), match, 'FactoringCompany row');
  });

  // ── 2 ── POST /invoices/factoring-companies ────────────────────────
  test('POST /invoices/factoring-companies creates a factoring company and returns the full row @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const payload = buildFactoringCompany({
      advanceRatePct: 92,
      feeRatePct: 2.5,
      recourseType: 'NON_RECOURSE',
    });
    const res = await asAdmin.post('/invoices/factoring-companies', payload);
    expect(res.status()).toBe(201);
    const company = expectContract(
      FactoringCompanySchema.strict(),
      await res.json(),
      'POST /invoices/factoring-companies',
    );
    createdCompanyPublicIds.push(company.companyId);

    // Semantic: emitted row echoes our inputs. Decimal columns come back
    // as strings (Prisma Decimal → string on the wire).
    expect(company.companyName).toBe(payload.companyName);
    expect(company.contactEmail).toBe(payload.contactEmail ?? null);
    expect(company.recourseType).toBe('NON_RECOURSE');
    expect(company.advanceRatePct).toBe('92');
    expect(company.feeRatePct).toBe('2.5');
    expect(company.status).toBe('ACTIVE');
    // Tenant-default pin moved to PATCH /tenants/me/factoring-default (Phase 1 overhaul).

    // Persistence: newly-created row now appears in the list.
    const listRes = await asDispatcher.get('/invoices/factoring-companies');
    expect(listRes.status()).toBe(200);
    const list = expectContract(FactoringCompanyListResponseSchema, await listRes.json());
    expect(list.some((c) => c.companyId === company.companyId)).toBe(true);
  });

  // ── 3 ── PATCH /invoices/factoring-companies/:company_id ────────────
  test('PATCH /invoices/factoring-companies/:company_id updates partial fields @workflow @destructive', async ({
    asAdmin,
  }) => {
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const update = buildFactoringCompanyUpdate({
      companyName: 'QA Renamed Factoring',
      feeRatePct: 4,
      status: 'INACTIVE',
    });
    const res = await asAdmin.patch(`/invoices/factoring-companies/${seeded.companyId}`, update);
    expect(res.status()).toBe(200);
    const updated = expectContract(
      FactoringCompanySchema.strict(),
      await res.json(),
      'PATCH /invoices/factoring-companies/:company_id',
    );

    // Semantic: updated fields land, untouched ones remain.
    expect(updated.companyId).toBe(seeded.companyId);
    expect(updated.companyName).toBe('QA Renamed Factoring');
    expect(updated.feeRatePct).toBe('4');
    expect(updated.status).toBe('INACTIVE');

    // Unknown id → 404.
    const missingRes = await asAdmin.patch('/invoices/factoring-companies/fc_does_not_exist', update);
    expect(missingRes.status()).toBe(404);
  });

  // ── 4 ── DELETE /invoices/factoring-companies/:company_id ───────────
  test('DELETE /invoices/factoring-companies/:company_id hard-deletes an unused company @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const seeded = await seedCompany(asAdmin);
    // Intentionally do NOT push to createdCompanyPublicIds — this test deletes
    // the row itself.

    const res = await asAdmin.delete(`/invoices/factoring-companies/${seeded.companyId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      FactoringCompanyDeleteResponseSchema.strict(),
      await res.json(),
      'DELETE /invoices/factoring-companies/:company_id',
    );
    expect(body.deleted).toBe(true);

    // Persistence: row no longer appears in the list.
    const listRes = await asDispatcher.get('/invoices/factoring-companies');
    expect(listRes.status()).toBe(200);
    const list = expectContract(FactoringCompanyListResponseSchema, await listRes.json());
    expect(list.some((c) => c.companyId === seeded.companyId)).toBe(false);

    // Second delete → 404.
    const againRes = await asAdmin.delete(`/invoices/factoring-companies/${seeded.companyId}`);
    expect(againRes.status()).toBe(404);
  });

  // ── 5 ── GET /invoices/factoring-companies/:companyId/contacts ──────
  test('GET /invoices/factoring-companies/:companyId/contacts lists ACTIVE contacts for a company @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    // Seed a contact so the list is guaranteed non-empty.
    const seedContactRes = await asDispatcher.post(
      `/invoices/factoring-companies/${seeded.id}/contacts`,
      buildFactoringContact(),
    );
    expect(seedContactRes.status()).toBe(201);
    const seedContact = expectContract(FactoringContactSchema.strict(), await seedContactRes.json());
    createdContactPublicIds.push(seedContact.contactId);

    const res = await asDispatcher.get(`/invoices/factoring-companies/${seeded.id}/contacts`);
    expect(res.status()).toBe(200);
    const list = expectContract(
      FactoringContactListResponseSchema,
      await res.json(),
      'GET /invoices/factoring-companies/:companyId/contacts',
    );
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.every((c) => c.status === 'ACTIVE')).toBe(true);
    expect(list.some((c) => c.contactId === seedContact.contactId)).toBe(true);
  });

  // ── 6 ── POST /invoices/factoring-companies/:companyId/contacts ─────
  test('POST /invoices/factoring-companies/:companyId/contacts creates a contact row @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const payload = buildFactoringContact({
      firstName: 'Quincy',
      lastName: 'Atwater',
      role: 'COLLECTIONS',
      title: 'Collections Lead',
    });
    const res = await asDispatcher.post(`/invoices/factoring-companies/${seeded.id}/contacts`, payload);
    expect(res.status()).toBe(201);
    const contact = expectContract(
      FactoringContactSchema.strict(),
      await res.json(),
      'POST /invoices/factoring-companies/:companyId/contacts',
    );
    createdContactPublicIds.push(contact.contactId);

    expect(contact.firstName).toBe('Quincy');
    expect(contact.lastName).toBe('Atwater');
    expect(contact.role).toBe('COLLECTIONS');
    expect(contact.title).toBe('Collections Lead');
    expect(contact.factoringCompanyId).toBe(seeded.id);
    expect(contact.status).toBe('ACTIVE');

    // Unknown company id → 404.
    const missingRes = await asDispatcher.post('/invoices/factoring-companies/9999999/contacts', payload);
    expect(missingRes.status()).toBe(404);
  });

  // ── 7 ── PATCH /invoices/factoring-contacts/:contactId ──────────────
  test('PATCH /invoices/factoring-contacts/:contactId updates a contact @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const createRes = await asDispatcher.post(
      `/invoices/factoring-companies/${seeded.id}/contacts`,
      buildFactoringContact(),
    );
    expect(createRes.status()).toBe(201);
    const contact = expectContract(FactoringContactSchema.strict(), await createRes.json());
    createdContactPublicIds.push(contact.contactId);

    const res = await asDispatcher.patch(`/invoices/factoring-contacts/${contact.contactId}`, {
      title: 'Senior AR Specialist',
      phone: '+15555550199',
    });
    expect(res.status()).toBe(200);
    const updated = expectContract(
      FactoringContactSchema.strict(),
      await res.json(),
      'PATCH /invoices/factoring-contacts/:contactId',
    );

    expect(updated.contactId).toBe(contact.contactId);
    expect(updated.title).toBe('Senior AR Specialist');
    expect(updated.phone).toBe('+15555550199');
    // Untouched field echoes the original.
    expect(updated.firstName).toBe(contact.firstName);
  });

  // ── 8 ── DELETE /invoices/factoring-contacts/:contactId ─────────────
  test('DELETE /invoices/factoring-contacts/:contactId soft-deletes (status=INACTIVE) @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const createRes = await asDispatcher.post(
      `/invoices/factoring-companies/${seeded.id}/contacts`,
      buildFactoringContact(),
    );
    expect(createRes.status()).toBe(201);
    const contact = expectContract(FactoringContactSchema.strict(), await createRes.json());
    // NOT tracked for cleanup — this test is the cleanup path.

    const res = await asDispatcher.delete(`/invoices/factoring-contacts/${contact.contactId}`);
    expect(res.status()).toBe(200);
    // Service returns the updated row (status=INACTIVE), NOT a `{ deleted }` envelope.
    const updated = expectContract(
      FactoringContactSchema.strict(),
      await res.json(),
      'DELETE /invoices/factoring-contacts/:contactId',
    );
    expect(updated.status).toBe('INACTIVE');
    expect(updated.contactId).toBe(contact.contactId);

    // Persistence: the list endpoint filters `status=ACTIVE`, so the
    // soft-deleted row no longer surfaces.
    const listRes = await asDispatcher.get(`/invoices/factoring-companies/${seeded.id}/contacts`);
    expect(listRes.status()).toBe(200);
    const list = expectContract(FactoringContactListResponseSchema, await listRes.json());
    expect(list.some((c) => c.contactId === contact.contactId)).toBe(false);
  });

  // ── 9 ── GET /invoices/noa-records ──────────────────────────────────
  test('GET /invoices/noa-records lists NOA records with nested customer + factoringCompany @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const createRes = await asAdmin.post('/invoices/noa-records', buildNoaRecord(customerId, seeded.id));
    expect(createRes.status()).toBe(201);
    const noa = expectContract(NoaRecordSchema.strict(), await createRes.json());
    createdNoaPublicIds.push(noa.noaId);

    const res = await asDispatcher.get(`/invoices/noa-records?customerId=${customerId}`);
    expect(res.status()).toBe(200);
    const list = expectContract(NoaRecordListResponseSchema, await res.json(), 'GET /invoices/noa-records');
    expect(list.length).toBeGreaterThan(0);
    const match = list.find((r) => r.noaId === noa.noaId);
    expect(match).toBeDefined();
    expect(match?.customer.id).toBe(customerId);
    expect(match?.factoringCompany.companyId).toBe(seeded.companyId);
  });

  // ── 10 ── POST /invoices/noa-records ────────────────────────────────
  test('POST /invoices/noa-records creates a new NOA record and enforces the per-pair uniqueness constraint @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const payload = buildNoaRecord(customerId, seeded.id, {
      notes: 'QA Phase 2 Group 2c — NOA create',
    });
    const res = await asAdmin.post('/invoices/noa-records', payload);
    expect(res.status()).toBe(201);
    const noa = expectContract(NoaRecordSchema.strict(), await res.json(), 'POST /invoices/noa-records');
    createdNoaPublicIds.push(noa.noaId);

    // Semantic: default status + nested projections.
    expect(noa.status).toBe('NOT_SENT');
    expect(noa.customerId).toBe(customerId);
    expect(noa.factoringCompanyId).toBe(seeded.id);
    expect(noa.customer.id).toBe(customerId);
    expect(noa.factoringCompany.companyId).toBe(seeded.companyId);
    expect(noa.notes).toBe('QA Phase 2 Group 2c — NOA create');

    // Conflict: second NOA for the same (customer, factoringCompany) pair
    // hits the Prisma unique index → 409 ConflictException.
    const dupRes = await asAdmin.post('/invoices/noa-records', payload);
    expect(dupRes.status()).toBe(409);
  });

  // ── 11 ── PATCH /invoices/noa-records/:noa_id/status ────────────────
  test('PATCH /invoices/noa-records/:noa_id/status walks the NOT_SENT → SENT → ACKNOWLEDGED state machine @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const createRes = await asAdmin.post('/invoices/noa-records', buildNoaRecord(customerId, seeded.id));
    expect(createRes.status()).toBe(201);
    const noa = expectContract(NoaRecordSchema.strict(), await createRes.json());
    createdNoaPublicIds.push(noa.noaId);
    expect(noa.status).toBe('NOT_SENT');

    // Invalid transition: NOT_SENT → ACKNOWLEDGED is rejected by the service.
    const invalidRes = await asAdmin.patch(
      `/invoices/noa-records/${noa.noaId}/status`,
      buildNoaStatusUpdate('ACKNOWLEDGED'),
    );
    expect(invalidRes.status()).toBe(400);

    // Legal transition 1: NOT_SENT → SENT.
    const sentRes = await asAdmin.patch(`/invoices/noa-records/${noa.noaId}/status`, buildNoaStatusUpdate('SENT'));
    expect(sentRes.status()).toBe(200);
    const sent = expectContract(
      NoaRecordSchema.strict(),
      await sentRes.json(),
      'PATCH /invoices/noa-records/:noa_id/status → SENT',
    );
    expect(sent.status).toBe('SENT');
    expect(sent.sentAt).not.toBeNull();

    // Legal transition 2: SENT → ACKNOWLEDGED.
    const ackRes = await asAdmin.patch(
      `/invoices/noa-records/${noa.noaId}/status`,
      buildNoaStatusUpdate('ACKNOWLEDGED'),
    );
    expect(ackRes.status()).toBe(200);
    const ack = expectContract(
      NoaRecordSchema.strict(),
      await ackRes.json(),
      'PATCH /invoices/noa-records/:noa_id/status → ACKNOWLEDGED',
    );
    expect(ack.status).toBe('ACKNOWLEDGED');
    expect(ack.acknowledgedAt).not.toBeNull();
    // Previously-stamped `sentAt` is preserved across the transition.
    expect(ack.sentAt).toBe(sent.sentAt);
  });

  // ── 12 ── DELETE /invoices/noa-records/:noa_id ──────────────────────
  test('DELETE /invoices/noa-records/:noa_id hard-deletes a NOA record @workflow @destructive', async ({
    asAdmin,
    asDispatcher,
  }) => {
    const customerId = await firstCustomerId(asDispatcher);
    const seeded = await seedCompany(asAdmin);
    createdCompanyPublicIds.push(seeded.companyId);

    const createRes = await asAdmin.post('/invoices/noa-records', buildNoaRecord(customerId, seeded.id));
    expect(createRes.status()).toBe(201);
    const noa = expectContract(NoaRecordSchema.strict(), await createRes.json());
    // NOT tracked for cleanup — this test is the cleanup path.

    const res = await asAdmin.delete(`/invoices/noa-records/${noa.noaId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      NoaRecordDeleteResponseSchema.strict(),
      await res.json(),
      'DELETE /invoices/noa-records/:noa_id',
    );
    expect(body.deleted).toBe(true);

    // Persistence: the row no longer appears in the list for that customer.
    const listRes = await asDispatcher.get(`/invoices/noa-records?customerId=${customerId}`);
    expect(listRes.status()).toBe(200);
    const list = expectContract(NoaRecordListResponseSchema, await listRes.json());
    expect(list.some((r) => r.noaId === noa.noaId)).toBe(false);

    // Second delete → 404.
    const againRes = await asAdmin.delete(`/invoices/noa-records/${noa.noaId}`);
    expect(againRes.status()).toBe(404);
  });
});
