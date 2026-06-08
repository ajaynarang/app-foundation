/**
 * Fleet — Custom Fields API (Phase 1 Group 4)
 *
 * Covers all 6 endpoints on `CustomFieldsController`:
 *   - POST   /custom-fields/definitions                → create
 *   - GET    /custom-fields/definitions?entityType=... → list
 *   - PATCH  /custom-fields/definitions/reorder        → reorder
 *   - PATCH  /custom-fields/definitions/:id            → update
 *   - DELETE /custom-fields/definitions/:id            → deactivate (soft)
 *   - GET    /custom-fields/definitions/:id/usage      → usage count
 *
 * Role rules (from @Roles decorators):
 *   - list                          → DISPATCHER/ADMIN/OWNER/DRIVER
 *   - create/update/delete/reorder  → DISPATCHER/ADMIN/OWNER
 *   - usage                         → DISPATCHER/ADMIN/OWNER
 *
 * The entire spec runs as DISPATCHER — every endpoint admits that role, and
 * the rubric requires a consistent fixture per endpoint unless a specific
 * role-boundary test is warranted (covered separately in the RBAC suite).
 *
 * Schema strategy — see `packages/test-utils/src/schemas/custom-fields.ts`
 * for the per-endpoint contract and the drift rationale against
 * `@sally/shared-types/fleet/custom-field.schema.ts`.
 *
 * Cleanup: every definition created by this spec is soft-deleted in
 * `afterEach` via the DELETE endpoint. Deactivation preserves uniqueness of
 * the `(tenantId, entityType, fieldKey)` index only for inactive records,
 * so parallel workers still get unique `fieldKey` via `unique()` in the
 * factory `name` default.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildCustomField } from '@sally/test-utils/factories';
import { expectContract, expectArrayContract, CustomFieldSchemas } from '@sally/test-utils/schemas';

const { CustomFieldDefinitionSchema, ReorderCustomFieldsResponseSchema, CustomFieldUsageResponseSchema } =
  CustomFieldSchemas;

test.describe('Fleet · Custom Fields @workflow', () => {
  // Track created definition ids so afterEach can deactivate them.
  const createdDefinitionIds: string[] = [];

  test.afterEach(async ({ asDispatcher }) => {
    for (const id of createdDefinitionIds.splice(0)) {
      await asDispatcher.delete(`/custom-fields/definitions/${id}`).catch(() => undefined);
    }
  });

  // 1 ── POST /custom-fields/definitions ───────────────────────────
  test('POST /custom-fields/definitions creates a TEXT definition @workflow @destructive', async ({ asDispatcher }) => {
    const payload = buildCustomField({ entityType: 'LOAD', fieldType: 'TEXT' });
    const res = await asDispatcher.post('/custom-fields/definitions', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(CustomFieldDefinitionSchema, await res.json(), 'POST /custom-fields/definitions');

    // Semantic: backend slugifies the name into fieldKey.
    expect(body.entityType).toBe('LOAD');
    expect(body.fieldType).toBe('TEXT');
    expect(body.name).toBe(payload.name);
    expect(body.isActive).toBe(true);
    expect(body.fieldKey).toMatch(/^[a-z0-9_]+$/);
    createdDefinitionIds.push(body.id);

    // Persistence: the new definition appears in the LOAD list.
    const listRes = await asDispatcher.get('/custom-fields/definitions?entityType=LOAD');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(CustomFieldDefinitionSchema, await listRes.json(), {
      allowEmpty: false,
      context: 'GET /custom-fields/definitions?entityType=LOAD',
    });
    const seeded = items.find((f) => f.id === body.id);
    expect(seeded).toBeDefined();
    expect(seeded?.fieldKey).toBe(body.fieldKey);
  });

  // 2 ── GET /custom-fields/definitions?entityType=... ─────────────
  test('GET /custom-fields/definitions lists active definitions filtered by entityType @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Seed two definitions on DRIVER + one on VEHICLE so the filter has
    // something to exclude.
    const driverPayload = buildCustomField({
      entityType: 'DRIVER',
      fieldType: 'NUMBER',
    });
    const vehiclePayload = buildCustomField({
      entityType: 'VEHICLE',
      fieldType: 'TEXT',
    });

    const driverRes = await asDispatcher.post('/custom-fields/definitions', driverPayload);
    expect(driverRes.status()).toBe(201);
    const driverBody = await driverRes.json();
    createdDefinitionIds.push(driverBody.id);

    const vehicleRes = await asDispatcher.post('/custom-fields/definitions', vehiclePayload);
    expect(vehicleRes.status()).toBe(201);
    const vehicleBody = await vehicleRes.json();
    createdDefinitionIds.push(vehicleBody.id);

    const res = await asDispatcher.get('/custom-fields/definitions?entityType=DRIVER');
    expect(res.status()).toBe(200);
    const items = expectArrayContract(CustomFieldDefinitionSchema, await res.json(), {
      allowEmpty: false,
      context: 'GET /custom-fields/definitions?entityType=DRIVER',
    });

    // Semantic: every returned definition is scoped to DRIVER and active.
    for (const f of items) {
      expect(f.entityType).toBe('DRIVER');
      expect(f.isActive).toBe(true);
    }

    // The DRIVER one we seeded appears; the VEHICLE one does not.
    const driverSeeded = items.find((f) => f.id === driverBody.id);
    expect(driverSeeded).toBeDefined();
    const vehicleSeeded = items.find((f) => f.id === vehicleBody.id);
    expect(vehicleSeeded).toBeUndefined();
  });

  // 3 ── PATCH /custom-fields/definitions/reorder ─────────────────
  test('PATCH /custom-fields/definitions/reorder reorders by id list @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Seed two definitions in the same entity scope so reorder has something
    // to shuffle deterministically.
    const aPayload = buildCustomField({ entityType: 'CUSTOMER', fieldType: 'TEXT' });
    const bPayload = buildCustomField({ entityType: 'CUSTOMER', fieldType: 'NUMBER' });

    const aRes = await asDispatcher.post('/custom-fields/definitions', aPayload);
    expect(aRes.status()).toBe(201);
    const a = await aRes.json();
    createdDefinitionIds.push(a.id);

    const bRes = await asDispatcher.post('/custom-fields/definitions', bPayload);
    expect(bRes.status()).toBe(201);
    const b = await bRes.json();
    createdDefinitionIds.push(b.id);

    // Initial order: a has sortOrder < b.
    expect(a.sortOrder).toBeLessThan(b.sortOrder);

    // Reorder: b first, a second.
    const reorderRes = await asDispatcher.patch('/custom-fields/definitions/reorder', { orderedIds: [b.id, a.id] });
    expect(reorderRes.status()).toBe(200);
    const reorderBody = expectContract(
      ReorderCustomFieldsResponseSchema,
      await reorderRes.json(),
      'PATCH /custom-fields/definitions/reorder',
    );
    expect(reorderBody.success).toBe(true);

    // Persistence: GET reflects the new sortOrder — service returns them
    // ordered ASC by sortOrder. b (index 0) should precede a (index 1).
    const listRes = await asDispatcher.get('/custom-fields/definitions?entityType=CUSTOMER');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(CustomFieldDefinitionSchema, await listRes.json(), {
      allowEmpty: false,
      context: 'GET /custom-fields/definitions?entityType=CUSTOMER',
    });
    const aAfter = items.find((f) => f.id === a.id);
    const bAfter = items.find((f) => f.id === b.id);
    expect(aAfter).toBeDefined();
    expect(bAfter).toBeDefined();
    // b was placed at index 0, a at index 1 — so b.sortOrder < a.sortOrder.
    expect(bAfter!.sortOrder).toBeLessThan(aAfter!.sortOrder);
  });

  // 4 ── PATCH /custom-fields/definitions/:id ─────────────────────
  test('PATCH /custom-fields/definitions/:id updates mutable fields @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildCustomField({ entityType: 'LOAD', fieldType: 'SELECT' });
    const createRes = await asDispatcher.post('/custom-fields/definitions', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdDefinitionIds.push(created.id);

    const newName = `Updated ${created.fieldKey}`;
    const newOptions = ['North', 'South'];
    const updateRes = await asDispatcher.patch(`/custom-fields/definitions/${created.id}`, {
      name: newName,
      options: newOptions,
      isRequired: true,
      showOnInvoice: true,
    });
    expect(updateRes.status()).toBe(200);
    const updated = expectContract(
      CustomFieldDefinitionSchema,
      await updateRes.json(),
      'PATCH /custom-fields/definitions/:id',
    );

    // Semantic: mutable fields reflect the patch; immutable (fieldType, fieldKey) do not.
    expect(updated.name).toBe(newName);
    expect(updated.options).toEqual(newOptions);
    expect(updated.isRequired).toBe(true);
    expect(updated.showOnInvoice).toBe(true);
    expect(updated.fieldType).toBe('SELECT');
    expect(updated.fieldKey).toBe(created.fieldKey);

    // Persistence: a subsequent GET reflects the update.
    const listRes = await asDispatcher.get('/custom-fields/definitions?entityType=LOAD');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(CustomFieldDefinitionSchema, await listRes.json(), {
      allowEmpty: false,
      context: 'GET after PATCH',
    });
    const after = items.find((f) => f.id === created.id);
    expect(after).toBeDefined();
    expect(after?.name).toBe(newName);
    expect(after?.options).toEqual(newOptions);
    expect(after?.isRequired).toBe(true);
  });

  // 5 ── DELETE /custom-fields/definitions/:id ────────────────────
  test('DELETE /custom-fields/definitions/:id soft-deactivates definition @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildCustomField({ entityType: 'VEHICLE', fieldType: 'DATE' });
    const createRes = await asDispatcher.post('/custom-fields/definitions', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    const res = await asDispatcher.delete(`/custom-fields/definitions/${created.id}`);
    expect(res.status()).toBe(200);
    const body = expectContract(CustomFieldDefinitionSchema, await res.json(), 'DELETE /custom-fields/definitions/:id');

    // Semantic: service sets isActive=false.
    expect(body.id).toBe(created.id);
    expect(body.isActive).toBe(false);

    // Persistence: deactivated definitions are excluded from the list query
    // (service filters on isActive: true).
    const listRes = await asDispatcher.get('/custom-fields/definitions?entityType=VEHICLE');
    expect(listRes.status()).toBe(200);
    const items = expectArrayContract(CustomFieldDefinitionSchema, await listRes.json(), {
      allowEmpty: true,
      context: 'GET after DELETE',
    });
    const after = items.find((f) => f.id === created.id);
    expect(after).toBeUndefined();

    // Already deactivated — no tracking push; afterEach would soft-delete again
    // but the catch() swallows the resulting 404 from the duplicate call.
  });

  // 6 ── GET /custom-fields/definitions/:id/usage ─────────────────
  test('GET /custom-fields/definitions/:id/usage returns zero for a fresh field @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildCustomField({ entityType: 'LOAD', fieldType: 'TEXT' });
    const createRes = await asDispatcher.post('/custom-fields/definitions', payload);
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    createdDefinitionIds.push(created.id);

    const res = await asDispatcher.get(`/custom-fields/definitions/${created.id}/usage`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      CustomFieldUsageResponseSchema,
      await res.json(),
      'GET /custom-fields/definitions/:id/usage',
    );

    // Semantic: a just-created field has zero entities referencing it.
    expect(body.count).toBe(0);
  });
});
