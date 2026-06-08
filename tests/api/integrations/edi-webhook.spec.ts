/**
 * Integrations · EDI webhook (Phase 5 Group 5d — 1 test).
 *
 * Covers the 1 endpoint on
 * `apps/backend/src/domains/integrations/edi/controllers/edi-webhook.controller.ts`:
 *
 *   50. POST /edi/webhooks/:tenantId — inbound EDI message receiver
 *
 * The endpoint is `@Public()` (no JWT) but signature-gated: the
 * `x-edi-signature` header must carry `sha256=<hex>` where the hex is
 * an HMAC-SHA256 of the raw body using `EDI_WEBHOOK_SECRET`. Signature
 * comparison uses `crypto.timingSafeEqual` (controller line 89).
 *
 * Status code: explicit `@HttpCode(200)` on line 60 — NOT the NestJS
 * POST default of 201. On success the handler returns
 * `{success: true, loadId: number, autoAccepted: boolean}` for
 * transactionType '204' (lines 108–112).
 *
 * Env precondition — `@requires:data-edi-webhook-secret` (finding #43):
 *   `EDI_WEBHOOK_SECRET` is UNSET on dev today. Without it the handler
 *   throws 401 "Webhook endpoint not configured" on every call (lines
 *   70–73). The capability is absent by default → the test is collection-
 *   excluded on default dev runs (`pnpm test:qa:local`). To run this
 *   test:
 *     1. Set EDI_WEBHOOK_SECRET in the backend env (Doppler sally-backend/dev).
 *     2. Restart the backend so the config is reloaded.
 *     3. Export `EDI_WEBHOOK_SECRET` in the test env so the spec can
 *        compute the signature.
 *     4. Run with `TESTS_DATA_CAPABILITIES=edi-webhook-secret`.
 *
 * Numeric tenant id invariant (`:tenantId` path param):
 *   The controller parses the path param as a number (`Number(tenantIdParam)`
 *   line 97) — the tenant SLUG is rejected. Tests need the numeric DB
 *   id, which is NOT the same as the `TENANT_ID` env var (that's the
 *   slug). We discover the numeric id via `GET /tenants/by-slug/:slug`
 *   on the super-admin fixture. This endpoint is on the platform
 *   tenants controller and returns `{id: number, tenantId: string, ...}`.
 *
 * Payload strategy: `buildTenderWebhookPayload()` emits a valid T204
 * CDC-ish shape with a new shipmentId each run. The service resolves
 * the partner by `senderIsaId` ('TESTBROKER01') — this ISA must match
 * a seeded partner on the tenant, OR the service throws 404 "Trading
 * partner with ISA … not found". To make the test self-contained,
 * the beforeAll bootstraps a trading partner with that ISA id.
 *
 * Raw-body contract: same as the Intuit webhook — stringify ONCE,
 * sign that exact string, send the string as `data` (Playwright sends
 * strings verbatim when content-type is set explicitly).
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAnonymous` (webhook is `@Public()`) +
 *     `asAdmin` for the bootstrap partner + tenantDbId lookup.
 *   - Factory: buildTenderWebhookPayload, buildTradingPartner.
 *   - Exact numeric status — 200 (explicit @HttpCode).
 *   - expectContract(EdiWebhookAckSchema.strict(), body).
 *   - Semantic — `success === true`, `loadId` is a positive number,
 *     `autoAccepted` is a boolean.
 *   - No explicit cleanup — the created load + partner persist until
 *     the next QA tenant reset.
 *   - Tags: `@workflow @contract @requires:data-edi-webhook-secret`.
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildTenderWebhookPayload, buildTradingPartner } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import { signEdiWebhook } from './_helpers';

const { EdiWebhookAckSchema } = IntegrationSchemas;

test.describe('Integrations · EDI webhook (HMAC signed) @workflow', () => {
  // 50 ── POST /edi/webhooks/:tenantId ──────────────────────────────────
  test('POST /edi/webhooks/:tenantId accepts a valid sha256-hex HMAC T204 payload (PUBLIC) @workflow @contract @requires:data-edi-webhook-secret', async ({
    asAnonymous,
    asAdmin,
  }) => {
    const webhookSecret = process.env.EDI_WEBHOOK_SECRET ?? '';
    if (!webhookSecret) {
      throw new Error(
        'EDI_WEBHOOK_SECRET not set — the webhook spec requires the ' +
          'secret to sign outbound payloads. Set it in Doppler ' +
          '(sally-backend/dev), restart the backend, export the same ' +
          'value in the test env, and run with ' +
          'TESTS_DATA_CAPABILITIES=edi-webhook-secret.',
      );
    }

    // 1. Resolve the numeric tenant DB id for the current tenant
    //    (path param is parsed as a number — slug rejected).
    const tenantSlug = process.env.TENANT_ID ?? 'demo-northstar-2026';
    const tenantRes = await asAdmin.get(`/tenants/by-slug/${tenantSlug}`);
    expect(tenantRes.status(), `GET /tenants/by-slug/${tenantSlug}`).toBe(200);
    const tenantBody = (await tenantRes.json()) as { id?: number };
    expect(typeof tenantBody.id, 'tenant record must expose a numeric DB id').toBe('number');
    const tenantDbId = tenantBody.id!;

    // 2. Ensure a trading partner exists whose ISA matches our payload's
    //    senderIsaId ('TESTBROKER01'). POST is idempotent via the
    //    unique(tenantId, isaId) constraint — we catch the 409 and
    //    proceed if it already exists.
    const partnerPayload = buildTradingPartner({ isaId: 'TESTBROKER01', gsId: 'TESTBROKER01' });
    const partnerRes = await asAdmin.post('/edi/settings/partners', partnerPayload);
    if (partnerRes.status() !== 201 && partnerRes.status() !== 409) {
      throw new Error(
        `bootstrap: POST /edi/settings/partners returned HTTP ${partnerRes.status()} ` +
          `— expected 201 (create) or 409 (already exists).`,
      );
    }

    // 3. Build the T204 payload, stringify ONCE, sign that string.
    const payloadObj = buildTenderWebhookPayload({ senderIsaId: 'TESTBROKER01' });
    const rawBody = JSON.stringify(payloadObj);
    const signature = signEdiWebhook(rawBody, webhookSecret);

    // 4. POST to the webhook. Path uses the numeric DB id — the slug
    //    is rejected by the Number() cast on line 97 of the controller.
    const res = await asAnonymous.post(`/edi/webhooks/${tenantDbId}`, rawBody, {
      headers: {
        'content-type': 'application/json',
        'x-edi-signature': signature,
      },
    });
    // Explicit @HttpCode(200) on controller line 60 — NOT 201.
    expect(res.status()).toBe(200);
    const body = expectContract(EdiWebhookAckSchema, await res.json(), `POST /edi/webhooks/${tenantDbId}`);

    // Semantic — happy path returns success=true; loadId is the id of
    // the newly-created Load row; autoAccepted is determined by rule
    // evaluation (false on a fresh tenant with no matching rule).
    expect(body.success).toBe(true);
    expect(body.loadId).toBeGreaterThan(0);
    expect(typeof body.autoAccepted).toBe('boolean');
  });
});
