/**
 * Integrations · QuickBooks webhook (Phase 5 Group 5c — 1 test).
 *
 * Covers the 1 endpoint on
 * `apps/backend/src/domains/integrations/accounting/controllers/accounting-webhook.controller.ts`:
 *
 *   39. POST /accounting/webhook — Intuit CDC (Change Data Capture) receiver
 *
 * The endpoint is `@Public()` (no JWT) but signature-gated: the
 * `intuit-signature` header must carry an HMAC-SHA256 of the raw body
 * (base64-encoded) using `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN`. Missing
 * signature → 401; wrong signature → 401; valid signature → 200 +
 * `{received: true}` regardless of whether the payload's realmId
 * matches any local integration (service logs "no integration found"
 * but still returns 200 because QB requires a fast 200 response —
 * controller lines 85–90 + 128–129).
 *
 * Status code: explicit `@HttpCode(200)` on line 38 — NOT the NestJS
 * POST default of 201.
 *
 * Env precondition: `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` must be set in
 * the environment. On dev it's `3bebd534-096e-4607-9e94-a862134b4162`
 * (Doppler-injected via `pnpm test:qa:local`). In CI / staging it's
 * set from the same source. If unset, the controller rejects with 401
 * "Webhook endpoint not configured" (line 53).
 *
 * Payload strategy: `buildAccountingWebhookPayload` factory emits a
 * valid CDC shape with `realmId: '0000000000'` — bogus on purpose so
 * the loop over events finds no matching integration and short-circuits
 * without creating any Job rows. The HTTP ACK still flips to `received:
 * true`, which is the contract we verify.
 *
 * Raw-body contract: `QuickBooksAdapter.validateWebhookSignature`
 * compares the base64 HMAC byte-for-byte via `timingSafeEqual` against
 * `rawBody.toString('utf8')` (controller line 50). Playwright's
 * `request.post(url, {data: <object>})` serialises the data through
 * `JSON.stringify`, which produces whatever key-ordering + whitespace
 * V8 chooses. To guarantee the signed string matches the wire bytes,
 * we stringify ONCE, sign that exact string, and pass the string as
 * `data` (Playwright sends strings verbatim with content-type passed
 * explicitly).
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAnonymous` — endpoint is `@Public()`.
 *   - Factory: buildAccountingWebhookPayload.
 *   - Exact numeric status — 200 (explicit @HttpCode).
 *   - expectContract(AccountingWebhookAckSchema.strict(), body).
 *   - Semantic — `received === true`.
 *   - No cleanup — service logs the payload but creates no DB rows
 *     when realmId doesn't match any integration.
 *   - Tags: `@workflow @contract`.
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildAccountingWebhookPayload } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import { signIntuitWebhook } from './_helpers';

const { AccountingWebhookAckSchema } = IntegrationSchemas;

test.describe('Integrations · QuickBooks webhook (Intuit HMAC) @workflow', () => {
  // 39 ── POST /accounting/webhook ─────────────────────────────────────
  test('POST /accounting/webhook accepts a valid HMAC-signed CDC payload (PUBLIC) @workflow @contract', async ({
    asAnonymous,
  }) => {
    const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN ?? '';
    if (!verifierToken) {
      throw new Error(
        'QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN not set — the webhook spec ' +
          'requires the Doppler-injected verifier token. Run via ' +
          '`pnpm test:qa:local` (Doppler-injected) OR export the env var ' +
          'manually: the dev value is `3bebd534-096e-4607-9e94-a862134b4162`.',
      );
    }

    // Build the payload, stringify it ONCE, sign that exact string,
    // send the string as `data` so the server reads the same bytes we
    // signed. `raw` and the wire-body MUST be identical — whitespace,
    // key ordering, everything.
    const payloadObj = buildAccountingWebhookPayload();
    const rawBody = JSON.stringify(payloadObj);
    const signature = signIntuitWebhook(rawBody, verifierToken);

    const res = await asAnonymous.post('/accounting/webhook', rawBody, {
      headers: {
        'content-type': 'application/json',
        'intuit-signature': signature,
      },
    });
    // Explicit @HttpCode(200) on controller line 38 — NOT 201.
    expect(res.status()).toBe(200);
    const body = expectContract(AccountingWebhookAckSchema, await res.json(), 'POST /accounting/webhook');

    // Semantic — the ACK always carries `received: true` on the happy
    // path (valid signature), irrespective of whether the realmId
    // matched any integration. With our bogus realmId, no jobs are
    // queued (service "no integration found" log, controller line 88),
    // but the contract flip to `true` is the test target.
    expect(body.received).toBe(true);
  });
});
