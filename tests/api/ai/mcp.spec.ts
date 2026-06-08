/**
 * MCP External Surface (Phase 6 Group 6d — 7 tests).
 *
 * Covers the 4 endpoints on
 * `apps/backend/src/domains/ai/mcp-server/mcp-server.controller.ts`
 * and the 2 endpoints on
 * `apps/backend/src/domains/ai/mcp-server/hitl-step-up.controller.ts`:
 *
 *    26.  POST   /mcp                           — 401 (no Authorization)
 *    27.  GET    /mcp                           — 405 (method not allowed)
 *    28.  DELETE /mcp                           — 401 (no Authorization)
 *    29.  POST   /mcp/apikey                    — 401 (bogus Bearer key)
 *    30.  GET    /mcp/hitl/:token               — 404 (non-existent UUID)
 *    31.  POST   /mcp/hitl/:token/step-up       — 400 no_pin (live shape)
 *    32.  POST   /mcp/hitl/:token/step-up       — 404 (gated; needs PIN+token)
 *
 * NOTE on tests 31-32 vs the original plan (finding #50): the plan
 * predicted the 404 / 400 distribution to be the OTHER way around. The
 * live controller checks the dispatcher's pinHash BEFORE looking up the
 * challenge token, so on the QA dispatcher fixture (no PIN seeded) the
 * 400 'no_pin' branch fires unconditionally — the 404 path is gated
 * behind a future fixture that has a PIN AND a real token.
 *
 * SCOPE — all 7 tests are ERROR-PATH assertions. ZERO LLM cost on every
 * run. The MCP positive-flow (a real OAuth-authenticated tool dispatch
 * through `POST /mcp`, plus the HITL happy path through `POST /mcp/hitl/
 * :token/step-up`) is Phase 8/9 — those need a full Claude.ai-style
 * OAuth session + a seeded `HitlChallenge` row.
 *
 * Why no positive-flow tests for the OAuth/ApiKey endpoints:
 *   - `POST /mcp` (OAuth) — needs an authorization_code flow against
 *     SALLY's OAuth provider, which is itself behind an interactive
 *     consent UI. Synthesising a token from inside the harness would
 *     require either (a) a backdoor mint endpoint we don't expose, or
 *     (b) replicating the full OAuth dance. Both Phase 8/9.
 *   - `POST /mcp/apikey` — needs an API key seeded with `mcp:*` scopes
 *     (PR #635 added scoped API keys). The platform/api-keys CRUD is
 *     covered in Phase 4 (PR #642), but the consumption side is
 *     deferred — no test in Phase 6 mints a fresh API key + invokes a
 *     tool through the MCP surface.
 *   - `DELETE /mcp` happy path — OAuth-protected; same blocker as POST.
 *
 * Why error paths only is the right shape:
 *   - The 9-criteria rubric assertions ARE the contract — `.strict()`
 *     schemas pin three distinct error envelopes (OAuth-style 401,
 *     ApiKey-style 401, HITL 404) plus the bare 405 controller body.
 *   - Live-probed against `demo-northstar-2026` (backend :8011) on
 *     2026-04-27 — every shape is reproduced exactly, no schema drift.
 *   - Future Phase 8/9 tests can REUSE the same schemas for the same
 *     error branches without breaking the 6d coverage.
 *
 * Three distinct envelope shapes (full breakdown in `schemas/ai.ts`):
 *
 *   1. `OAuthTokenGuard` 401 — `{statusCode, timestamp, path, method,
 *      detail: 'Request failed', error: 'invalid_token',
 *      error_description: 'Bearer token required'}`. Tests 26 + 28.
 *   2. `ApiKeyAuthGuard` 401 — `{statusCode, timestamp, path, method,
 *      detail, message, error: 'Unauthorized'}`. Test 29.
 *   3. `GET /mcp` 405 — `{error: 'Method Not Allowed', message: '...'}`
 *      — BARE controller body, NO HttpExceptionFilter wrap. Test 27.
 *   4. HITL 404 — `{statusCode, timestamp, path, method, detail,
 *      message: 'Challenge not found', error: 'Not Found'}`. Tests 30 + 31.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAnonymous` for tests 26-29 (no auth required to
 *     reach the guard / 405 handler); `asDispatcher` for tests 30-32
 *     (HITL controller is JWT + RolesGuard-protected with
 *     `@Roles(DISPATCHER, ADMIN, OWNER)`).
 *   - Factories: `MCP_BOGUS_API_KEY` constant (test 29),
 *     `MCP_BOGUS_HITL_TOKEN` sentinel UUID (tests 30, 31, 32),
 *     `buildMcpStepUpRequest` for the step-up DTO body (tests 31, 32).
 *     Tests 26-28 have no payload — they're pure auth-presence probes.
 *   - Exact numeric status: `.toBe(401)`, `.toBe(405)`, `.toBe(404)`,
 *     `.toBe(400)` — verified via curl probe before writing tests.
 *   - `expectContract(Schema.strict(), body)` on every assertion.
 *   - Semantic property — guard discriminator (`error: 'invalid_token'`
 *     for OAuth; `error: 'Unauthorized'` for ApiKey), 405 message
 *     mentions stateless mode, 404 carries 'Challenge not found'.
 *   - Persistence — N/A. Error-path tests have no DB writes; the auth
 *     guards short-circuit BEFORE any persistence layer is reached.
 *   - Cleanup — none needed. No rows created.
 *   - Tags — `@workflow @rbac` baseline (every test asserts an auth /
 *     authorization gate); `@destructive` on tests 28, 31, 32 (DELETE
 *     and step-up POST are mutating verbs even though the auth gate
 *     fires before the mutation runs); `@requires:data-hitl-token` on
 *     test 32 (collection-excluded by default — needs a seeded challenge).
 *   - Zero runtime `test.skip(cond, ...)`.
 *
 * Anonymous client header override pattern (test 29):
 *
 *   `asAnonymous` is constructed with token=`''`, so the API client
 *   sends NO `Authorization` header by default. To send a custom Bearer
 *   token (the bogus API key), pass it via the `headers` option on the
 *   POST call — the client wrapper merges per-request headers AFTER the
 *   constructor headers (api-client.ts:35-36), so our override wins.
 *
 * Source-of-truth probes (curl --silent --include against backend :8011):
 *   - POST /mcp (no auth)        → live shape pinned to McpAuthErrorOAuthSchema.
 *   - GET /mcp                   → live shape pinned to McpMethodNotAllowedSchema.
 *   - DELETE /mcp (no auth)      → identical to POST /mcp.
 *   - POST /mcp/apikey (bogus)   → live shape pinned to McpAuthErrorApiKeySchema.
 *   - GET /mcp/hitl/<sentinel> + DISPATCHER bearer → 404 envelope (not
 *     curl-probed pre-write because it requires a JWT; service path
 *     traced in code: `findUnique` returns null → NotFoundException).
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  MCP_BOGUS_API_KEY,
  MCP_BOGUS_HITL_TOKEN,
  buildMcpStepUpRequest,
} from '@sally/test-utils/factories';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';

const {
  McpAuthErrorOAuthSchema,
  McpAuthErrorApiKeySchema,
  McpMethodNotAllowedSchema,
  McpHitlNotFoundSchema,
  McpHitlNoPinSchema,
} = AiSchemas;

// ─── MCP root surface (tests 26-29) — auth/guard rejection paths ────────
test.describe('MCP · External surface — auth rejection paths @workflow @rbac', () => {
  // 26 ── POST /mcp without Authorization → 401 from OAuthTokenGuard ────
  test('POST /mcp returns 401 invalid_token when no Authorization header is sent (ANONYMOUS) @workflow @rbac', async ({
    asAnonymous,
  }) => {
    // No body needed — OAuthTokenGuard is class-level and runs before
    // the body parser hits any handler logic (oauth-token.guard.ts:21-32).
    // Sending `data: undefined` on the role-client is fine; Playwright
    // emits a content-length-0 POST.
    const res = await asAnonymous.post('/mcp');
    expect(res.status()).toBe(401);

    const body = expectContract(McpAuthErrorOAuthSchema, await res.json(), 'POST /mcp (no auth)');

    // Semantic — the guard's OAuth-style envelope is the discriminator.
    // `error` is the LITERAL `'invalid_token'` string (RFC 6750), the
    // `error_description` mentions Bearer required, and `path` echoes
    // the full URL the filter saw (`/api/v1/mcp`). The rubric is
    // contract-shape only; we still pin a couple of values to lock the
    // guard's contract.
    expect(body.error).toBe('invalid_token');
    expect(body.error_description.toLowerCase()).toContain('bearer');
    expect(body.path).toBe('/api/v1/mcp');
    expect(body.method).toBe('POST');
    expect(body.statusCode).toBe(401);
  });

  // 27 ── GET /mcp → 405 from controller body (no filter wrap) ──────────
  test('GET /mcp returns 405 method-not-allowed in stateless mode (ANONYMOUS) @workflow @rbac', async ({
    asAnonymous,
  }) => {
    // `GET /mcp` is `@Public()` and `@SkipThrottle()` (mcp-server.controller.ts:48-50).
    // The handler calls `res.status(405).json(...)` DIRECTLY — bypassing
    // the global HttpExceptionFilter — so the envelope is the bare
    // controller body, NOT the SALLY error shape.
    const res = await asAnonymous.get('/mcp');
    expect(res.status()).toBe(405);

    const body = expectContract(McpMethodNotAllowedSchema, await res.json(), 'GET /mcp (405)');

    // Semantic — the controller's literal message (line 56) names the
    // stateless-mode posture so MCP clients don't poll for SSE.
    expect(body.error).toBe('Method Not Allowed');
    expect(body.message.toLowerCase()).toContain('stateless');
  });

  // 28 ── DELETE /mcp without Authorization → 401 from OAuthTokenGuard ──
  test('DELETE /mcp returns 401 invalid_token when no Authorization header is sent (ANONYMOUS) @workflow @destructive @rbac', async ({
    asAnonymous,
  }) => {
    // DELETE /mcp is the session-termination endpoint (mcp-server.controller.ts:63-72).
    // Class-level `@UseGuards(OAuthTokenGuard)` rejects the request
    // BEFORE the handler's `res.json({status: 'ok'})`, so on the no-auth
    // path we observe the same OAuth 401 shape as POST /mcp. Tagging
    // `@destructive` because the verb itself is mutating; the auth gate
    // happens to fire first.
    const res = await asAnonymous.delete('/mcp');
    expect(res.status()).toBe(401);

    const body = expectContract(McpAuthErrorOAuthSchema, await res.json(), 'DELETE /mcp (no auth)');

    // Semantic — same discriminator as test 26, asserted distinctly so
    // future drift on EITHER endpoint trips its own assertion. `method`
    // here MUST be the literal 'DELETE' — the filter pulls it from
    // `request.method` (http-exception.filter.ts:117).
    expect(body.error).toBe('invalid_token');
    expect(body.method).toBe('DELETE');
    expect(body.statusCode).toBe(401);
  });

  // 29 ── POST /mcp/apikey with bogus Bearer → 401 from ApiKeyAuthGuard ─
  test('POST /mcp/apikey returns 401 when the Bearer is a bogus API key (ANONYMOUS) @workflow @rbac', async ({
    asAnonymous,
  }) => {
    // `asAnonymous` ships with NO Authorization header. We override per
    // request via the `headers` option — the role-client merges these
    // AFTER the constructor headers (api-client.ts:35-36), so our bogus
    // key wins. The guard's `validateKey` (api-keys.service) hashes the
    // suffix + Prisma-lookups; nothing matches → returns null →
    // `UnauthorizedException('Invalid, expired, or IP-blocked API key')`.
    const res = await asAnonymous.post('/mcp/apikey', undefined, {
      headers: { Authorization: `Bearer ${MCP_BOGUS_API_KEY}` },
    });
    expect(res.status()).toBe(401);

    const body = expectContract(
      McpAuthErrorApiKeySchema,
      await res.json(),
      'POST /mcp/apikey (bogus key)',
    );

    // Semantic — the ApiKey guard envelope discriminates from the OAuth
    // envelope via `error: 'Unauthorized'` (vs `'invalid_token'`). The
    // service's invalid-key message is the LITERAL string the guard
    // throws (api-key-auth.guard.ts:29) — pinning the substring 'Invalid'
    // catches a future refactor that swapped the message text.
    expect(body.error).toBe('Unauthorized');
    expect(body.statusCode).toBe(401);
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(msg).toMatch(/invalid/i);
    expect(body.path).toBe('/api/v1/mcp/apikey');
  });
});

// ─── HITL surface (tests 30-32) — non-existent token → 404, gated 400 ──
test.describe('MCP · HITL step-up — non-existent token paths @workflow @rbac', () => {
  // 30 ── GET /mcp/hitl/:token (sentinel UUID) → 404 ─────────────────────
  test('GET /mcp/hitl/:token returns 404 when the challenge does not exist (DISPATCHER) @workflow @rbac', async ({
    asDispatcher,
  }) => {
    // `MCP_BOGUS_HITL_TOKEN` is the all-zeros sentinel UUID. The
    // controller's `findUnique({where: {id: token}})` (hitl-step-up.controller.ts:37)
    // returns null on every tenant → `throw new NotFoundException('Challenge not found')`.
    // The same 404 fires for the post-existence cross-tenant guard
    // (line 42-44) — both branches converge on the same envelope.
    const res = await asDispatcher.get(`/mcp/hitl/${MCP_BOGUS_HITL_TOKEN}`);
    expect(res.status()).toBe(404);

    const body = expectContract(
      McpHitlNotFoundSchema,
      await res.json(),
      `GET /mcp/hitl/${MCP_BOGUS_HITL_TOKEN}`,
    );

    // Semantic — the SALLY filter spreads the NestJS string-ctor object
    // form onto the envelope; `message` carries the literal 'Challenge
    // not found' from the controller (line 40). `error: 'Not Found'` is
    // Nest's auto-injected legacy field. `path` includes the sentinel.
    expect(body.statusCode).toBe(404);
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(msg.toLowerCase()).toContain('challenge');
    expect(body.error).toBe('Not Found');
    expect(body.path).toBe(`/api/v1/mcp/hitl/${MCP_BOGUS_HITL_TOKEN}`);
    expect(body.method).toBe('GET');
  });

  // 31 ── POST /mcp/hitl/:token/step-up (sentinel UUID + no-PIN dispatcher) → 400 ───
  //
  // FINDING #50 (live probe 2026-04-27): the plan (phase-6-ai.md §6
  // line 230) predicted this branch would return 404 — the assumption
  // was that token validation happens BEFORE PIN validation. The live
  // controller (hitl-step-up.controller.ts:99-115) does the opposite:
  //
  //   1. `prisma.user.findUnique({where: {id: user.dbId}})` — 404 if
  //      no row (impossible from a JWT-authenticated request).
  //   2. `if (!record.pinHash)` → BadRequestException({code: 'no_pin'}).
  //   3. `verifyPin(dto.pin, record.pinHash)` — 400 'Invalid PIN'.
  //   4. `challenges.markStepUpCompleted(token, ...)` — only HERE does
  //      a missing-token reach NotFoundException.
  //
  // The QA dispatcher fixture is seeded WITHOUT a PIN (no pinHash on
  // the User row — verified via the 400 response with `code: 'no_pin'`).
  // So with this fixture, EVERY call to `/step-up` short-circuits at
  // step 2 — the token (real or sentinel) is irrelevant.
  //
  // To still cover the step-up endpoint's contract shape, this test
  // asserts the no-PIN 400 branch (McpHitlNoPinSchema). The 404
  // 'challenge not found' assertion that the plan asked for is
  // currently unreachable from the QA harness — it would require either
  // (a) a dispatcher fixture WITH a PIN (Phase 8/9 hardening), or
  // (b) a backdoor to set/unset pinHash from the test (out of scope).
  //
  // Appended to findings.md as finding #50.
  test('POST /mcp/hitl/:token/step-up returns 400 no_pin when the dispatcher has no PIN (DISPATCHER) @workflow @destructive @rbac', async ({
    asDispatcher,
  }) => {
    // Sentinel token doubles as a deterministic "definitely-doesn't-exist"
    // path so future hardenings (a fixture with PIN seeded) flip THIS
    // test from 400 to 404 without changing the URL.
    const payload = buildMcpStepUpRequest();

    const res = await asDispatcher.post(
      `/mcp/hitl/${MCP_BOGUS_HITL_TOKEN}/step-up`,
      payload,
    );
    expect(res.status()).toBe(400);

    const body = expectContract(
      McpHitlNoPinSchema,
      await res.json(),
      `POST /mcp/hitl/${MCP_BOGUS_HITL_TOKEN}/step-up (no PIN)`,
    );

    // Semantic — the discriminator `code: 'no_pin'` is the stable API
    // (controller line 106). The `message` text could change; `code`
    // is the contract. `path` includes the step-up sub-route, validating
    // the controller's per-method routing.
    expect(body.code).toBe('no_pin');
    expect(body.statusCode).toBe(400);
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(msg.toLowerCase()).toContain('pin');
    expect(body.path).toBe(`/api/v1/mcp/hitl/${MCP_BOGUS_HITL_TOKEN}/step-up`);
    expect(body.method).toBe('POST');
  });

  // 32 ── POST /mcp/hitl/:token/step-up (real token + dispatcher w/PIN) → 404 ─────
  //
  // Gated on `@requires:data-hitl-token`. Together with a real token
  // AND a dispatcher fixture that has a seeded PIN, the controller
  // proceeds past steps 1-3 and reaches `markStepUpCompleted`. If the
  // supplied token IS expired/invalid, the service throws 404 (this
  // assertion). If valid, it would 200 — but Phase 6d is error-path
  // only; the operator who flips this capability is signing up for
  // the 404 branch with a deliberately invalid token.
  //
  // Today the test collection-excludes by default via
  // `@requires:data-hitl-token`. When Phase 8/9 lands a dispatcher-with-
  // PIN fixture and a token-seeding helper, the operator can flip the
  // capability + supply `TESTS_HITL_TOKEN=<expired-but-real-uuid>` to
  // exercise the 404 'Challenge not found' path.
  //
  // The schema (`McpHitlNotFoundSchema`) is reused from test 30 —
  // identical envelope, different routing path.
  test('POST /mcp/hitl/:token/step-up returns 404 with seeded dispatcher PIN + bogus token (DISPATCHER) @workflow @destructive @rbac @requires:data-hitl-token', async ({
    asDispatcher,
  }) => {
    // Operator MUST export `TESTS_HITL_TOKEN` to a syntactically-valid
    // but no-longer-resolvable challenge id alongside flipping
    // `TESTS_DATA_CAPABILITIES=hitl-token`. The fallback is the sentinel
    // — only reachable if the operator misconfigured.
    const realToken = process.env.TESTS_HITL_TOKEN ?? MCP_BOGUS_HITL_TOKEN;
    const payload = buildMcpStepUpRequest();

    const res = await asDispatcher.post(`/mcp/hitl/${realToken}/step-up`, payload);
    expect(res.status()).toBe(404);

    const body = expectContract(
      McpHitlNotFoundSchema,
      await res.json(),
      `POST /mcp/hitl/${realToken}/step-up (404)`,
    );

    expect(body.statusCode).toBe(404);
    const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(msg.toLowerCase()).toContain('challenge');
    expect(body.error).toBe('Not Found');
    expect(body.method).toBe('POST');
  });
});
