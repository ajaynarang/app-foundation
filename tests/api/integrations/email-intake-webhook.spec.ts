/**
 * Integrations · Email Intake Webhook (Phase 5 Group 5e — 1 test on
 * EmailIntakeWebhookController).
 *
 * Covers the 1 endpoint on
 * `apps/backend/src/domains/integrations/email-intake/controllers/email-intake-webhook.controller.ts`:
 *
 *   60. POST /integrations/email-intake/webhook — Resend inbound receiver
 *
 * The endpoint is `@Public()` (no JWT) and HMAC-gated via Svix (`svix-id`,
 * `svix-timestamp`, `svix-signature` headers). Status is EXPLICIT
 * `@HttpCode(200)` on controller line 32 — NOT the Nest POST default 201.
 *
 * Dev-env bypass (finding #44): `RESEND_INBOUND_WEBHOOK_SECRET` is EMPTY
 * (not unset) on dev — the handler's `verifySignature` short-circuits at
 * line 101 with a warn log and returns without validating. Tests can
 * therefore POST unsigned payloads. This bypass is defensive for dev
 * only; stg/prd MUST set the secret.
 *
 * Payload strategy: LEGACY-FLAT shape (controller lines 59–63). When
 * `body.type !== 'email.received'` the `else` branch treats the body as
 * `ResendInboundEmailDataDto` directly. We use `buildEmailIntakeWebhookPayload`
 * which emits the flat shape with a `to[0]` that's deliberately NOT owned
 * by any tenant — `emailIntakeService.resolveTenant` returns null and the
 * handler returns `{status: 'ignored', reason: 'unknown_recipient'}` with
 * a 200 response (lines 72–76).
 *
 * Why this assertion target: a genuine happy path (`status: 'accepted'`)
 * would require either seeding email-intake settings on the tenant with a
 * known recipient address AND uploading attachments (so the service's
 * `processInboundEmail` doesn't 500 on a Resend API lookup), OR mocking
 * the Resend SDK. Both are out of scope for a contract test. The
 * `unknown_recipient` branch is a legitimate, deterministic code path
 * that exercises the entire controller (body parsing, header handling,
 * tenant resolution) without external dependencies.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAnonymous` — endpoint is `@Public()`.
 *   - Factory: buildEmailIntakeWebhookPayload.
 *   - Exact numeric status — 200 (explicit `@HttpCode(200)`).
 *   - expectContract(EmailIntakeWebhookAckSchema.strict(), body) — discriminated
 *     union on `status`; the `ignored` branch narrows `reason`.
 *   - Semantic — status === 'ignored' && reason === 'unknown_recipient'.
 *   - No cleanup — the webhook does not persist anything when the
 *     recipient is unknown (resolveTenant null short-circuits BEFORE
 *     any DB writes; the log line on 74 is the only side-effect).
 *   - Tags: `@workflow @contract`.
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildEmailIntakeWebhookPayload } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';

const { EmailIntakeWebhookAckSchema } = IntegrationSchemas;

test.describe('Integrations · Email Intake webhook (Svix dev-bypass) @workflow', () => {
  // 60 ── POST /integrations/email-intake/webhook ──────────────────────
  test('POST /integrations/email-intake/webhook ignores payloads with unknown recipient (PUBLIC) @workflow @contract', async ({
    asAnonymous,
  }) => {
    const payload = buildEmailIntakeWebhookPayload();

    // No Svix headers — the handler's `else` branch (controller lines
    // 59–63) treats the body as the flat ResendInboundEmailDataDto
    // without calling `verifySignature`. Even if the verifier fired, it
    // would short-circuit at line 101 (RESEND_INBOUND_WEBHOOK_SECRET
    // empty on dev — finding #44).
    const res = await asAnonymous.post('/integrations/email-intake/webhook', payload);

    // Explicit @HttpCode(200) on controller line 32 — NOT 201.
    expect(res.status()).toBe(200);
    const body = expectContract(
      EmailIntakeWebhookAckSchema,
      await res.json(),
      'POST /integrations/email-intake/webhook',
    );

    // Semantic — the discriminated-union schema narrows on `status`.
    // For an unknown recipient we MUST land in the 'ignored' branch
    // with `reason: 'unknown_recipient'`.
    expect(body.status).toBe('ignored');
    if (body.status === 'ignored') {
      // TypeScript narrowing guaranteed by the discriminated union.
      expect(body.reason).toBe('unknown_recipient');
    }
  });
});
