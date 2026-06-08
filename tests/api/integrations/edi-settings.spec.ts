/**
 * Integrations · EDI Settings (Phase 5 Group 5d — 5 tests on EDISettingsController).
 *
 * Covers the 5 endpoints on
 * `apps/backend/src/domains/integrations/edi/controllers/edi-settings.controller.ts`:
 *
 *   40. GET   /edi/settings/partners                 — list trading partners
 *   41. GET   /edi/settings/partners/:partnerId      — trading partner detail
 *   42. POST  /edi/settings/partners                 — create trading partner
 *   43. PATCH /edi/settings/partners/:partnerId      — update trading partner
 *   44. GET   /edi/settings/messages                 — paged message audit
 *
 * Every endpoint is `@RequireFeature('edi_integration')` + `@Roles(ADMIN, OWNER)`
 * — the spec uses `asAdmin` and tags every test `@requires:plan-edi_integration`.
 * When `edi_integration` is disabled on the target tenant the whole spec is
 * collection-excluded; when enabled all 5 tests run green on a fresh dev tenant
 * because the create test self-provisions the row the detail + patch tests need.
 *
 * Status-code map (verified against controller source):
 *   - GET 40, 41, 44: 200 (Nest GET default).
 *   - POST 42: 201 (Nest POST default — controller has NO `@HttpCode` override).
 *   - PATCH 43: 200 (Nest PATCH default).
 *
 * Serial bootstrap: tests 41 + 43 need a real partner row. Test 42 creates one
 * and stashes its id on a describe-scoped handle; 41 + 43 read it; test 44
 * (message audit) is read-only and parallel-safe but kept in the same block
 * for readability.
 *
 * Cleanup gap: the controller exposes NO `DELETE /edi/settings/partners/:id`
 * endpoint (confirmed — only list / detail / create / patch + a sibling
 * messages route). The created partner row remains until the next tenant
 * reset — acceptable for the demo-northstar-2026 QA tenant, which the
 * runner blows away periodically. Name uses `[QA-TEST]` prefix + unique()
 * suffix for easy identification in Prisma Studio.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAdmin`.
 *   - Factories: buildTradingPartner, buildTradingPartnerPatch.
 *   - Exact numeric status on every test (verified against source).
 *   - expectContract(EdiTradingPartnerSchema.strict(), body) on every happy path.
 *   - Semantic assertion on every test (echo, non-empty array, paged envelope shape).
 *   - No cleanup (no DELETE endpoint) — documented above.
 *   - Tags: `@workflow @contract @requires:plan-edi_integration` baseline;
 *     `@destructive` on tests 42 + 43 (persist rows).
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildTradingPartner, buildTradingPartnerPatch } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';

const {
  EdiTradingPartnerSchema,
  EdiTradingPartnerListSchema,
  EdiMessageAuditListSchema,
} = IntegrationSchemas;

test.describe('Integrations · EDI Settings @workflow @contract @requires:plan-edi_integration', () => {
  // Serial — tests 42 → 41 → 43 share the created partner. Test 44
  // (read-only) doesn't depend on the row but is kept in-block for
  // narrative cohesion.
  test.describe.configure({ mode: 'serial' });

  let scopedPartnerId: number | undefined;

  // 42 ── POST /edi/settings/partners ───────────────────────────────────
  //
  // Ordered FIRST so the created row is available for 41 + 43. Live
  // probe: controller has no `@HttpCode` → NestJS POST default 201.
  test('POST /edi/settings/partners creates a trading partner (ADMIN) @workflow @contract @destructive @requires:plan-edi_integration', async ({
    asAdmin,
  }) => {
    const payload = buildTradingPartner();
    const res = await asAdmin.post('/edi/settings/partners', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(EdiTradingPartnerSchema, await res.json(), 'POST /edi/settings/partners');

    // Semantic — the service echoes name, isaId, gsId, and sets
    // isActive=true on the fresh row (schema default). tendersReceived
    // is 0 on a new partner.
    expect(body.name).toBe(payload.name);
    expect(body.isaId).toBe(payload.isaId);
    expect(body.gsId).toBe(payload.gsId);
    expect(body.isActive).toBe(true);
    expect(body.tendersReceived).toBe(0);
    expect(body.id).toBeGreaterThan(0);

    // Stash for tests 41 + 43.
    scopedPartnerId = body.id;
  });

  // 40 ── GET /edi/settings/partners ────────────────────────────────────
  test('GET /edi/settings/partners lists the tenant trading partners (ADMIN) @workflow @contract @requires:plan-edi_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.get('/edi/settings/partners');
    expect(res.status()).toBe(200);
    const body = expectContract(EdiTradingPartnerListSchema, await res.json(), 'GET /edi/settings/partners');

    // Semantic — after test 42 created a partner, the list must be
    // non-empty AND must include the created row. The service uses
    // `include: { _count: { messages, autoAcceptRules } }` on the list
    // projection; the schema optional-tolerates the `_count` block.
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    if (scopedPartnerId !== undefined) {
      expect(body.some((p) => p.id === scopedPartnerId)).toBe(true);
    }
  });

  // 41 ── GET /edi/settings/partners/:partnerId ─────────────────────────
  test('GET /edi/settings/partners/:partnerId returns the detail row (ADMIN) @workflow @contract @requires:plan-edi_integration', async ({
    asAdmin,
  }) => {
    expect(scopedPartnerId, 'test 42 must have succeeded to bootstrap the row').toBeDefined();
    const res = await asAdmin.get(`/edi/settings/partners/${scopedPartnerId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      EdiTradingPartnerSchema,
      await res.json(),
      `GET /edi/settings/partners/${scopedPartnerId}`,
    );

    // Semantic — detail row matches creation id. Service ::getPartner
    // includes `autoAcceptRules: { where: { isActive: true } }` — the
    // schema tolerates the optional array.
    expect(body.id).toBe(scopedPartnerId);
    expect(body.tenantId).toBeGreaterThan(0);
    expect(body.name.length).toBeGreaterThan(0);
    // autoAcceptRules, when present, must be an array.
    if (body.autoAcceptRules !== undefined) {
      expect(Array.isArray(body.autoAcceptRules)).toBe(true);
    }
  });

  // 43 ── PATCH /edi/settings/partners/:partnerId ───────────────────────
  test('PATCH /edi/settings/partners/:partnerId updates the row (ADMIN) @workflow @contract @destructive @requires:plan-edi_integration', async ({
    asAdmin,
  }) => {
    expect(scopedPartnerId, 'test 42 must have succeeded to bootstrap the row').toBeDefined();
    const payload = buildTradingPartnerPatch();
    const res = await asAdmin.patch(`/edi/settings/partners/${scopedPartnerId}`, payload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      EdiTradingPartnerSchema,
      await res.json(),
      `PATCH /edi/settings/partners/${scopedPartnerId}`,
    );

    // Semantic — patched fields echo back.
    expect(body.id).toBe(scopedPartnerId);
    expect(body.name).toBe(payload.name);
    expect(body.statusUpdateLevel).toBe(payload.statusUpdateLevel);
  });

  // 44 ── GET /edi/settings/messages ────────────────────────────────────
  test('GET /edi/settings/messages returns the paged audit envelope (ADMIN) @workflow @contract @requires:plan-edi_integration', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.get('/edi/settings/messages');
    expect(res.status()).toBe(200);
    const body = expectContract(EdiMessageAuditListSchema, await res.json(), 'GET /edi/settings/messages');

    // Semantic — paged envelope defaults (service line 74:
    // `page = 1, limit = 50`). No messages seeded on dev; data[] is
    // empty. The strict schema still enforces envelope shape.
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(body.limit);
    expect(body.total).toBeGreaterThanOrEqual(body.data.length);
  });
});
