/**
 * Integrations · EDI Tender (Phase 5 Group 5d — 5 tests on EDITenderController).
 *
 * Covers the 5 endpoints on
 * `apps/backend/src/domains/integrations/edi/controllers/edi-tender.controller.ts`:
 *
 *   45. GET   /edi/tenders                           — pending tender list
 *   46. POST  /edi/tenders/:loadId/respond           — respond to a tender
 *   47. GET   /edi/tenders/rules                     — auto-accept rules
 *   48. POST  /edi/tenders/rules                     — create auto-accept rule
 *   49. PATCH /edi/tenders/rules/:ruleId/approve     — approve Sally-suggested rule
 *
 * Every endpoint is `@RequireFeature('edi_integration')` +
 * `@Roles(DISPATCHER, ADMIN, OWNER)` — the spec uses `asDispatcher` and
 * tags every test `@requires:plan-edi_integration`.
 *
 * Status-code map (verified against controller source):
 *   - GET 45, 47: 200 (Nest GET default).
 *   - POST 46, 48: 201 (Nest POST default — no `@HttpCode` override).
 *   - PATCH 49: 200 (Nest PATCH default).
 *
 * Data-capability gating:
 *   - Test 46 needs an existing pending tender (a Load in TENDER status
 *     linked to an inbound T204 EDIMessage). Demo-northstar-2026 ships
 *     zero tenders → tag `@requires:data-edi-tender`, collection-
 *     excluded on default dev runs. See finding #43 for why the ingress
 *     webhook can't be used to seed.
 *   - Test 49 needs a pending Sally-suggested rule (`createdBy=
 *     'sally_suggested'` AND `approvedAt=null`). Sally-suggested rules
 *     originate from the AI pattern-detection subsystem (no public
 *     POST) — demo tenants do not ship any. Tag
 *     `@requires:data-edi-suggested-rule`, collection-excluded by
 *     default. NOTE: test 48 creates a rule with createdBy='user' (the
 *     service default), so the PATCH-approve target MUST be a
 *     separately-seeded row, NOT the one we just created.
 *
 * Serial bootstrap: test 48 creates a user-rule; tests 45 + 47 are
 * read-only. Test 46 uses `firstPendingEdiTender` helper (throws tag-
 * message if capability absent). Test 49 uses `firstSuggestedEdiRule`
 * helper similarly.
 *
 * No cleanup path: the rule created by test 48 persists (no DELETE
 * endpoint). Acceptable for the QA tenant — same pattern as the
 * trading-partner create in edi-settings.spec.ts.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher`.
 *   - Factories: buildAutoAcceptRuleCreate, buildEdiTenderResponse.
 *   - Exact numeric status on every test (verified against source).
 *   - expectContract(Schema, body) on every happy path.
 *   - Semantic assertion on every test.
 *   - Tags: `@workflow @contract @requires:plan-edi_integration` baseline;
 *     `@destructive` on tests 46, 48, 49 (persist or mutate rows);
 *     `@requires:data-edi-tender` on 46; `@requires:data-edi-suggested-rule`
 *     on 49.
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildAutoAcceptRuleCreate, buildEdiTenderResponse } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import { firstPendingEdiTender, firstSuggestedEdiRule } from './_helpers';

const {
  EdiTenderListSchema,
  EdiTenderResponseSchema,
  EdiAutoAcceptRuleSchema,
  EdiAutoAcceptRuleListSchema,
} = IntegrationSchemas;

test.describe('Integrations · EDI Tender @workflow @contract @requires:plan-edi_integration', () => {
  test.describe.configure({ mode: 'serial' });

  // 45 ── GET /edi/tenders ──────────────────────────────────────────────
  test('GET /edi/tenders lists pending tenders (DISPATCHER) @workflow @contract @requires:plan-edi_integration', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/edi/tenders');
    expect(res.status()).toBe(200);
    const body = expectContract(EdiTenderListSchema, await res.json(), 'GET /edi/tenders');

    // Semantic — array of EDIMessage rows. Empty on dev; on a seeded
    // tenant each row's `messageType === 'T204'` and `status ===
    // 'RECEIVED'` per service ::findPendingTenders.
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.messageType).toBe('T204');
      expect(row.status).toBe('RECEIVED');
    }
  });

  // 46 ── POST /edi/tenders/:loadId/respond ─────────────────────────────
  //
  // Gated on `@requires:data-edi-tender`: needs a pending tender. On
  // default dev runs the capability is absent → the test is excluded
  // at collection. When present, the test accepts the first pending
  // tender.
  test('POST /edi/tenders/:loadId/respond accepts a pending tender (DISPATCHER) @workflow @contract @destructive @requires:plan-edi_integration @requires:data-edi-tender', async ({
    asDispatcher,
  }) => {
    const { loadId } = await firstPendingEdiTender(asDispatcher);
    const payload = buildEdiTenderResponse({ response: 'accept' });
    const res = await asDispatcher.post(`/edi/tenders/${loadId}/respond`, payload);
    // Nest POST default — no @HttpCode on the controller. Finding #46
    // precedent.
    expect(res.status()).toBe(201);
    const body = expectContract(
      EdiTenderResponseSchema,
      await res.json(),
      `POST /edi/tenders/${loadId}/respond`,
    );

    // Semantic — service returns the updated Load row. `status` flips
    // from 'TENDER' to 'PENDING' on accept (service line 286).
    // `tenderResponse` enum flips to 'ACCEPTED' (line 282).
    // `tenderRespondedAt` is set to `new Date()` (line 295).
    expect(body.id).toBe(loadId);
    expect(body.status).toBe('PENDING');
    expect(body.tenderResponse).toBe('ACCEPTED');
    expect(body.tenderRespondedAt).not.toBeNull();
  });

  // 47 ── GET /edi/tenders/rules ────────────────────────────────────────
  test('GET /edi/tenders/rules lists auto-accept rules (DISPATCHER) @workflow @contract @requires:plan-edi_integration', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/edi/tenders/rules');
    expect(res.status()).toBe(200);
    const body = expectContract(EdiAutoAcceptRuleListSchema, await res.json(), 'GET /edi/tenders/rules');

    // Semantic — array of rule rows. Each row carries the optional
    // `tradingPartner: {name}` projection (service ::listRules includes
    // it). `isActive`-desc sort is applied — but we don't assert that
    // (sort order isn't a contract we pin).
    expect(Array.isArray(body)).toBe(true);
    for (const rule of body) {
      expect(rule.name.length).toBeGreaterThan(0);
      expect(typeof rule.isActive).toBe('boolean');
      expect(typeof rule.priority).toBe('number');
    }
  });

  // 48 ── POST /edi/tenders/rules ───────────────────────────────────────
  test('POST /edi/tenders/rules creates a user-authored rule (DISPATCHER) @workflow @contract @destructive @requires:plan-edi_integration', async ({
    asDispatcher,
  }) => {
    const payload = buildAutoAcceptRuleCreate();
    const res = await asDispatcher.post('/edi/tenders/rules', payload);
    // Nest POST default — no @HttpCode on the controller.
    expect(res.status()).toBe(201);
    const body = expectContract(EdiAutoAcceptRuleSchema, await res.json(), 'POST /edi/tenders/rules');

    // Semantic — `createdBy` defaults to 'user' (service line 107);
    // `priority` echoes; `approvedAt` is set to `new Date()` for user
    // rules (service line 109). `isActive` default is true per schema.
    expect(body.name).toBe(payload.name);
    expect(body.priority).toBe(payload.priority);
    expect(body.createdBy).toBe('user');
    expect(body.approvedAt).not.toBeNull();
    expect(body.isActive).toBe(true);
  });

  // 49 ── PATCH /edi/tenders/rules/:ruleId/approve ──────────────────────
  //
  // Gated on `@requires:data-edi-suggested-rule`. The target must be a
  // rule in `createdBy='sally_suggested'` + `approvedAt=null` state —
  // NOT the row created by test 48 (which is user-authored + already
  // approved). Sally-suggested rules are AI-emitted; no public POST
  // seeds them. Helper throws with tag message when absent.
  test('PATCH /edi/tenders/rules/:ruleId/approve approves a Sally-suggested rule (DISPATCHER) @workflow @contract @destructive @requires:plan-edi_integration @requires:data-edi-suggested-rule', async ({
    asDispatcher,
  }) => {
    const { ruleId } = await firstSuggestedEdiRule(asDispatcher);
    const res = await asDispatcher.patch(`/edi/tenders/rules/${ruleId}/approve`, {});
    expect(res.status()).toBe(200);
    const body = expectContract(
      EdiAutoAcceptRuleSchema,
      await res.json(),
      `PATCH /edi/tenders/rules/${ruleId}/approve`,
    );

    // Semantic — service ::approveRule sets `approvedAt = new Date()`
    // and `approvedByUserId = userId` (lines 122–123). The row's
    // `createdBy` stays 'sally_suggested' (not modified).
    expect(body.id).toBe(ruleId);
    expect(body.approvedAt).not.toBeNull();
    expect(body.approvedByUserId).not.toBeNull();
    expect(body.createdBy).toBe('sally_suggested');
  });
});
