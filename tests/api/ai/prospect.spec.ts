/**
 * Sally AI · Prospect (Phase 6 Group 6c — 3 tests on ProspectController).
 *
 * Covers the 3 `@Public()` endpoints on
 * `apps/backend/src/domains/ai/sally-ai/prospect.controller.ts`:
 *
 *    20. POST /prospect/conversations             — create anonymous session
 *    21. POST /prospect/conversations/:id/messages — streaming Sally response
 *    22. GET  /prospect/conversations/:id/messages — message history
 *
 * Auth model:
 *   - Class is `@Public()` (line 11) — no JWT required.
 *   - Tests use `asAnonymous` (no Authorization header).
 *   - The `:id/messages` endpoints (POST + GET) require `x-session-token`
 *     as a HEADER (controller lines 29, 44). The token is minted by
 *     `POST /conversations` and returned in the response body.
 *
 * Throttle (controller decorators):
 *   - Create: 5 / hour per IP (line 16).
 *   - Send-message: 50 / hour per IP (line 23).
 *   - Get history: 100 / hour per IP (line 42).
 *
 *   Group 6c spends 1-2 conversations per run (tests 20 + 22). Test 21
 *   reuses test 20's row when collected. The 5/h budget is comfortable.
 *
 * Cleanup: none possible — `@Public()` prospect surface has NO DELETE
 * endpoint. Conversation rows persist until tenant-reset.
 *
 * Test 21 (streaming): tagged `@requires:data-ai-gateway-credits` so the
 * test is collection-excluded by default — invoking the LLM costs money.
 * When credits exist, the first frame from the AI-SDK data-stream protocol
 * is asserted (same protocol as the dispatcher chat path — see
 * `_helpers.ts::readFirstStreamFrame`).
 *
 * Test 22 (history): asserts ONLY the greeting message from
 * `createConversation` (always present, written synchronously). The user
 * message from test 21 is NOT asserted here so that test 22 stays
 * independent of LLM credits — the greeting alone validates the contract.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: asAnonymous (the `@Public()` controller).
 *   - Factory: buildProspectConversation, buildProspectMessage.
 *   - Helper: prospectSession (wraps create-conversation).
 *   - Status codes: 201 (POST × 2), 200 (GET × 1) — verified live.
 *   - expectContract on every assertion.
 *   - Tags: `@workflow @public` baseline; `@streaming @ai @requires:data-ai-gateway-credits`
 *     for test 21.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildProspectMessage } from '@sally/test-utils/factories';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';
import { prospectSession, readFirstStreamFrame } from './_helpers';

const {
  ProspectConversationResponseSchema,
  MessageListSchema,
  SallyAiStreamFrameSchema,
} = AiSchemas;

test.describe('Sally AI · Prospect (public) @workflow @public', () => {
  // 20 ── POST /prospect/conversations ────────────────────────────────
  test('POST /prospect/conversations creates an anonymous prospect session (ANONYMOUS) @workflow @contract @public', async ({
    asAnonymous,
  }) => {
    // No body required — the controller's `createConversation()` signature
    // has zero params (line 18). Pass `{}` so the Playwright signature
    // accepts the call cleanly.
    const res = await asAnonymous.post('/prospect/conversations', {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      ProspectConversationResponseSchema,
      await res.json(),
      'POST /prospect/conversations',
    );

    // Semantic — server mints both `conversationId` and `sessionToken`
    // (service lines 23-24 via `generateId('conv')` / `generateId('sess')`).
    // `userMode` is hard-coded to `'prospect'` (line 33). The greeting
    // is written in the same Prisma transaction (lines 30-46) so it's
    // always present and non-empty.
    expect(body.conversationId.length).toBeGreaterThan(0);
    expect(body.sessionToken.length).toBeGreaterThan(0);
    expect(body.userMode).toBe('prospect');
    expect(body.greeting.role).toBe('assistant');
    expect(body.greeting.content.length).toBeGreaterThan(0);
  });

  // 21 ── POST /prospect/conversations/:id/messages (streaming) ───────
  //
  // Tagged `@requires:data-ai-gateway-credits` because the prospect
  // streamMessage path invokes the AI gateway via Mastra (service
  // lines 142-156). On a credit-exhausted gateway the response can
  // 500 before the first write — the schema enforces happy-path shape
  // only. With ENABLE_ALL_TESTS=1 the test runs and probes the gateway.
  test('POST /prospect/conversations/:id/messages streams Sally response (ANONYMOUS + session token) @workflow @streaming @ai @public @requires:data-ai-gateway-credits', async ({
    asAnonymous,
  }) => {
    // Each LLM-hitting test creates its own prospect session so the
    // throttle cost is bounded and tests stay independent.
    const { conversationId, sessionToken } = await prospectSession(asAnonymous);

    const payload = buildProspectMessage();
    // 30s timeout — same envelope as the dispatcher streaming test.
    // The AI gateway can take tens of seconds for a complete turn; we
    // only assert the FIRST frame.
    const res = await asAnonymous.post(
      `/prospect/conversations/${conversationId}/messages`,
      payload,
      {
        headers: { 'x-session-token': sessionToken },
        timeout: 30_000,
      },
    );
    // Same 201 default as the dispatcher streaming POST — neither
    // controller calls `res.status(...)` on the happy path; Nest
    // falls back to the POST default. See finding #48 (Group 6a).
    expect(res.status()).toBe(201);

    const frame = await readFirstStreamFrame(res);
    const parsed = expectContract(
      SallyAiStreamFrameSchema,
      frame,
      `POST /prospect/conversations/${conversationId}/messages (first frame)`,
    );

    // Semantic — the first frame's `kind` is one of the 4 known
    // discriminators from the AI-SDK data-stream protocol (sally-ai.service
    // .ts:415-427 + pipe-agent-response.ts:66/79/89/105). Phase 6 rubric
    // is contract-shape only — no model-content assertions.
    expect(['0', '8', '9', 'a']).toContain(parsed.kind);
  });

  // 22 ── GET /prospect/conversations/:id/messages ────────────────────
  test('GET /prospect/conversations/:id/messages returns history with greeting (ANONYMOUS + session token) @workflow @contract @public', async ({
    asAnonymous,
  }) => {
    // Fresh prospect session — greeting is written synchronously inside
    // `createConversation` (no LLM dependency), so the history is
    // guaranteed to contain at least 1 message regardless of gateway state.
    const { conversationId, sessionToken } = await prospectSession(asAnonymous);

    const res = await asAnonymous.get(`/prospect/conversations/${conversationId}/messages`, {
      headers: { 'x-session-token': sessionToken },
    });
    expect(res.status()).toBe(200);
    const body = expectContract(
      MessageListSchema,
      await res.json(),
      `GET /prospect/conversations/${conversationId}/messages`,
    );

    // Semantic — the envelope echoes the `conversationId` and the
    // server-set `userMode='prospect'`. The greeting from
    // `createConversation` (service lines 27-46) is the first row.
    expect(body.conversationId).toBe(conversationId);
    expect(body.userMode).toBe('prospect');
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    const greeting = body.messages[0];
    expect(greeting.role).toBe('assistant');
    expect(greeting.content.length).toBeGreaterThan(0);
  });
});
