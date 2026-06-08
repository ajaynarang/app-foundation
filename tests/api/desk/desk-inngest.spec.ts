/**
 * Desk Inngest (Phase 6 Group 6f — 1 test on InngestController).
 *
 * Covers the 1 catch-all endpoint on
 * `apps/backend/src/domains/desk/core/inngest/inngest.controller.ts`:
 *
 *    48. GET /api/v1/api/inngest — Inngest serve introspection
 *
 * Auth: the controller is decorated with `@All()` and no `@Public()`,
 * so the global `JwtAuthGuard` (registered in app.module.ts:155-157)
 * gates every method. Live probe (2026-04-27) confirmed anonymous GET
 * returns 401, JWT GET reaches Inngest's `serve()` handler.
 *
 * The plan's §6 line 261 sketched `asAnonymous` based on Inngest's
 * "HMAC inside the handler" model. That model is correct for POST
 * (signed payload from Inngest Cloud) — but the global JwtAuthGuard
 * runs FIRST, before any controller code. Hence: JWT-bearing
 * `asDispatcher` is the only fixture that reaches the handler.
 *
 * Path is `/api/v1/api/inngest` — Nest's `setGlobalPrefix('api/v1')`
 * applies to this controller (`@Controller('api/inngest')` → final
 * path `/api/v1/api/inngest`). The MCP root controller is the only
 * `/`-prefixed exclusion (main.ts:97-103).
 *
 * Status code (when configured): 200 with the function-registry JSON.
 *
 * IMPORTANT — Finding #55 (Phase 6 Group 6f):
 *   On dev today the response is HTTP 500 with body
 *   `{"code":"internal_server_error"}` because `INNGEST_EVENT_KEY` /
 *   `INNGEST_SIGNING_KEY` env vars are unset. Inngest's `serve()`
 *   handler refuses to introspect without a signing key.
 *
 *   Test is gated on `@requires:data-inngest-configured` (env-gated
 *   capability — same pattern as `voice-agent-secret`,
 *   `edi-webhook-secret`, `tenant-register-bypass`). Once those env
 *   vars are set in the target environment, flip via
 *   `TESTS_DATA_CAPABILITIES=inngest-configured` and the test exercises
 *   the full introspection contract.
 *
 * Persistence: pure GET — no DB writes. Envelope shape + the registered
 * function count are the contract.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher` (JWT required — see auth note above).
 *   - Factory: none (read-only GET).
 *   - Exact numeric status (`.toBe(200)`).
 *   - expectContract on the JSON body.
 *   - Semantic property: `function_count >= 1` (ar-followup is the one
 *     registered function — inngest.controller.ts line 34).
 *   - Tags per the plan (`@workflow @contract @desk`).
 *   - Zero runtime `test.skip(cond, ...)`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, DeskSchemas } from '@sally/test-utils/schemas';

const { InngestServeResponseSchema } = DeskSchemas;

test.describe('Desk Inngest · serve introspection @workflow @contract @desk', () => {
  // 48 ── GET /api/v1/api/inngest ────────────────────────────────────
  test('GET /api/inngest returns the registered function registry @workflow @contract @desk @requires:data-inngest-configured', async ({
    asDispatcher,
  }) => {
    // Path note: `asDispatcher.get` prefixes with `${API_BASE_URL}` which
    // already includes `/api/v1`. The Inngest controller registers at
    // `api/inngest` so the final URL is `${API_BASE_URL}/api/inngest`.
    const res = await asDispatcher.get('/api/inngest');
    expect(res.status()).toBe(200);

    const body = expectContract(
      InngestServeResponseSchema,
      await res.json(),
      'GET /api/inngest',
    );

    // Semantic — Sally registers exactly one Inngest function today
    // (ar-followup; inngest.controller.ts line 34). The count grows as
    // new responsibilities land their own Inngest workflow; we assert
    // ≥1 so future additions don't trip this test.
    expect(body.function_count).toBeGreaterThanOrEqual(1);
    expect(body.schema_version.length).toBeGreaterThan(0);
  });
});
