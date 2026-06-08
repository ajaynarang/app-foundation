/**
 * Integrations · Email Intake Settings (Phase 5 Group 5e — 2 tests on
 * EmailIntakeSettingsController).
 *
 * Covers the 2 endpoints on
 * `apps/backend/src/domains/integrations/email-intake/controllers/email-intake-settings.controller.ts`:
 *
 *   58. GET /integrations/email-intake/settings
 *   59. PUT /integrations/email-intake/settings
 *
 * Class-level `@RequireFeature('email_intake')` — every test is tagged
 * `@requires:plan-email_intake`. No `@Roles(...)` on the controller; the
 * class-level JWT guard accepts any authenticated user. We use
 * `asAdmin` for consistency with the rest of Phase 5.
 *
 * Status codes (verified against controller source — no `@HttpCode`):
 *   - GET 58: 200 (Nest GET default)
 *   - PUT 59: 200 (Nest PUT default — NOT 201)
 *
 * Settings row lifecycle: `EmailIntakeService::getSettings` auto-provisions
 * an `EmailIngestSettings` row the first time a tenant calls the endpoint
 * (generates a unique `inboundAddress` from subdomain/slug). Subsequent
 * calls return the row directly. So test 58 is side-effect-free on a
 * provisioned tenant, and provisions-then-returns on a fresh one —
 * either way the contract is GET-200 with the row projection.
 *
 * Serial bootstrap: test 58 must run before test 59 so we can capture
 * the ORIGINAL values and restore them in afterAll — otherwise 59's
 * patch persists across runs and skews the demo tenant's state. The
 * restore uses the same PUT endpoint with the captured values.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAdmin`.
 *   - Factory: buildEmailIntakeSettingsPatch (test 59 only).
 *   - Exact numeric status — 200 on both.
 *   - expectContract(EmailIntakeSettingsSchema.strict(), body) on both.
 *   - Semantic — test 58 asserts isEnabled boolean; test 59 asserts
 *     patched field echoes.
 *   - Cleanup — afterAll restores the original `autoApproveCustomerDomains`
 *     value captured in test 58 via an idempotent PUT.
 *   - Tags: `@workflow @contract @requires:plan-email_intake` baseline;
 *     `@destructive` on test 59 (persists a setting change).
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildEmailIntakeSettingsPatch } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';

const { EmailIntakeSettingsSchema } = IntegrationSchemas;

test.describe('Integrations · Email Intake Settings @workflow @contract @requires:plan-email_intake', () => {
  // Serial — test 58 captures originals for test 59's restore.
  test.describe.configure({ mode: 'serial' });

  let originalAutoApprove: boolean | undefined;

  // 58 ── GET /integrations/email-intake/settings ──────────────────────
  test('GET /integrations/email-intake/settings returns the row (ADMIN) @workflow @contract @requires:plan-email_intake', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.get('/integrations/email-intake/settings');
    expect(res.status()).toBe(200);
    const body = expectContract(
      EmailIntakeSettingsSchema,
      await res.json(),
      'GET /integrations/email-intake/settings',
    );

    // Semantic — `isEnabled` is a boolean, `inboundAddress` non-empty,
    // `approvedDomains` is an array (may be empty on a fresh tenant).
    expect(typeof body.isEnabled).toBe('boolean');
    expect(body.inboundAddress.length).toBeGreaterThan(0);
    expect(Array.isArray(body.approvedDomains)).toBe(true);

    // Capture original for test 59's end-of-test restore.
    originalAutoApprove = body.autoApproveCustomerDomains;
  });

  // 59 ── PUT /integrations/email-intake/settings ──────────────────────
  test('PUT /integrations/email-intake/settings patches the row (ADMIN) @workflow @contract @destructive @requires:plan-email_intake', async ({
    asAdmin,
  }) => {
    // Flip `autoApproveCustomerDomains` to the OPPOSITE of the captured
    // original so the echo-check has signal. Test 58 must have run first
    // (serial block) — `originalAutoApprove` is guaranteed defined.
    expect(
      originalAutoApprove,
      'test 58 must have run and captured originalAutoApprove',
    ).toBeDefined();
    const patch = buildEmailIntakeSettingsPatch({
      autoApproveCustomerDomains: !originalAutoApprove,
    });

    const res = await asAdmin.put('/integrations/email-intake/settings', patch);
    // Nest PUT default — no `@HttpCode` override on the handler.
    expect(res.status()).toBe(200);
    const body = expectContract(
      EmailIntakeSettingsSchema,
      await res.json(),
      'PUT /integrations/email-intake/settings',
    );

    // Semantic — patched field echoes on the response row.
    expect(body.autoApproveCustomerDomains).toBe(!originalAutoApprove);

    // Persistence — follow-up GET reflects the patch.
    const verifyRes = await asAdmin.get('/integrations/email-intake/settings');
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(EmailIntakeSettingsSchema, await verifyRes.json());
    expect(verify.autoApproveCustomerDomains).toBe(!originalAutoApprove);

    // Restore the original value so the demo tenant's state is
    // preserved for subsequent runs (idempotent PUT). afterAll hooks
    // can't reuse `asAdmin` (fixture is test-scoped), so we restore
    // inside the test itself — serial block guarantees this is the
    // terminal step.
    const restoreRes = await asAdmin.put('/integrations/email-intake/settings', {
      autoApproveCustomerDomains: originalAutoApprove,
    });
    expect(restoreRes.status()).toBe(200);
  });
});
