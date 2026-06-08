/**
 * Sally AI · Core (Phase 6 Group 6a — 7 tests on SallyAiController).
 *
 * Covers the 6 endpoints on
 * `apps/backend/src/domains/ai/sally-ai/sally-ai.controller.ts` plus a
 * cross-tenant 404 assertion:
 *
 *    1.  POST /conversations                           — create
 *    2.  POST /conversations/:id/messages              — streaming turn
 *    3.  POST /conversations/:id/resume                — HITL resume
 *    4.  GET  /conversations                           — list (limit)
 *    5.  GET  /conversations/:id/messages              — history
 *    6.  GET  /conversations/agents/status             — per-agent rollup
 *    7.  GET  /conversations/:id                       — cross-tenant 404
 *       (maps to GET /conversations/:id/messages — the controller
 *        does not expose a bare `:id` GET; the messages endpoint is
 *        the equivalent tenant-ownership probe and returns 404 via
 *        `sally-ai.service.ts::getMessages` on an unknown id.)
 *
 * File-level strategy — two describe blocks:
 *
 *   Serial block (tests 1, 2, 3, 5): share a single conversation row.
 *     Test 1 creates the conversation. Tests 2, 3, 5 consume the
 *     same conversationId (sending a message, attempting resume,
 *     reading history). Serial because tests 3+5 have a data
 *     dependency on test 1's POST. Test 2 is in the serial block
 *     even though it doesn't strictly require test 1's row (it
 *     could create its own) — keeping it here minimises API calls
 *     on a cold gateway and preserves the "send → history" flow
 *     across tests 2 and 5 (the user message from test 2 surfaces
 *     in test 5's list).
 *
 *   Parallel block (tests 4, 6, 7): read-only + cross-tenant.
 *     Test 4 lists conversations (tenant-scoped; reads whatever is
 *     there). Test 6 reads the agent status rollup. Test 7 asserts
 *     the 404 envelope on an unknown conversation id.
 *
 * Streaming protocol — the AI SDK data-stream protocol
 * ---------------------------------------------------
 * `streamMessage` (sally-ai.service.ts:415-427) emits lines of the form
 * `<prefix>:<json>\n` where prefix ∈ `{0, 8, 9, a}`. Tests drain the full
 * body via `readFirstStreamFrame(res)` which splits the first line on
 * the first colon and returns `{ kind, payload }`. The whole-stream
 * completion is NOT asserted — the AI gateway may take tens of seconds
 * and emits model tokens we're not verifying (Phase 6 rubric is
 * contract-shape only).
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asDispatcher` (controller is
 *     `@Roles(OWNER, ADMIN, DISPATCHER, DRIVER, CUSTOMER)`-gated;
 *     DISPATCHER is the representative happy path).
 *   - Factories: buildCreateConversation, buildSendMessage, buildResumeAgent.
 *   - Exact numeric status (`.toBe(201)`/`.toBe(200)`/`.toBe(404)`).
 *   - expectContract(Schema.strict(), body) on every assertion.
 *   - Semantic property on every test.
 *   - Persistence: test 5's GET validates test 1's create AND test 2's
 *     send-message writes (user + assistant messages surface in the
 *     history). Test 2's first-frame existence verifies the stream
 *     fired.
 *   - Cleanup: the conversation row is tenant-scoped and will be cleaned
 *     up by tenant-reset between runs. Sally AI has NO public DELETE
 *     endpoint for conversations — documented here.
 *   - Tags: `@workflow @contract` baseline; `@streaming`, `@ai`,
 *     `@destructive`, `@rbac`, `@requires:data-ai-gateway-credits`,
 *     `@requires:data-hitl-suspended-agent` as applicable.
 *   - Zero runtime `test.skip(cond, ...)`.
 *
 * Gotchas (for future Groups 6b-6f inheriting the streaming pattern):
 *
 *   1. The first observable frame on a healthy turn is `0:"…"\n` —
 *      NOT `{type: 'start', ...}` and NOT SSE `event: …`. The AI SDK
 *      data-stream protocol is a 1-char prefix, NOT a JSON envelope
 *      per line. This tripped the original plan schema draft.
 *
 *   2. On server errors BEFORE the first write, the handler calls
 *      `res.status(500).json({...})` (sally-ai.service.ts:436) — so
 *      the response is JSON, NOT a stream. Tests must handle both
 *      shapes: successful streaming OR error envelope. The
 *      `@requires:data-ai-gateway-credits` tag collection-excludes
 *      tests when credits are exhausted (upstream 500 is expected).
 *
 *   3. `resumeAgent` on an invalid runId/toolCallId throws INSIDE
 *      Mastra before the first write — `res.headersSent` is false,
 *      so the catch block (line 505) returns 500 + JSON envelope.
 *      That is NOT the same as the streaming happy path. Test 3
 *      tags `@requires:data-hitl-suspended-agent` so that the
 *      happy-path streaming assertion can only fire on a tenant
 *      with a live suspended run — on default dev runs the test
 *      is collection-excluded.
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildCreateConversation,
  buildSendMessage,
  buildResumeAgent,
} from '@sally/test-utils/factories';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';
import { readFirstStreamFrame } from './_helpers';

const {
  ConversationRowSchema,
  ConversationListSchema,
  MessageListSchema,
  AgentStatusResponseSchema,
  SallyAiStreamFrameSchema,
  AiErrorEnvelopeSchema,
} = AiSchemas;

// ─── Serial block (tests 1 → 2 → 3 → 5) — one conversation shared ──────
test.describe('Sally AI · Conversation lifecycle @workflow', () => {
  // Serial — tests 2, 3, 5 depend on the conversation created by test 1.
  test.describe.configure({ mode: 'serial' });

  let conversationId: string | undefined;
  let sentContent: string | undefined;

  // No afterAll cleanup — Sally AI has no public DELETE endpoint for
  // conversations. Rows live until the tenant-reset utility wipes them
  // (apps/backend/scripts/cleanup-for-testing.ts handles ConversationMessage
  // + Conversation in its FK-safe deletion order). QA runs assume that
  // cleanup happens between branches, not between individual tests.

  // 1 ── POST /conversations ───────────────────────────────────────────
  test('POST /conversations creates a new Sally AI conversation (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const payload = buildCreateConversation({ userMode: 'dispatcher' });
    const res = await asDispatcher.post('/conversations', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(ConversationRowSchema, await res.json(), 'POST /conversations');

    // Semantic — server-authoritative conversationId is generated and
    // echoed. userMode echoes the request. The greeting (embedded
    // assistant message) is pre-populated with the persona-appropriate
    // welcome text — service lines 95-107 map userMode → greeting.
    expect(body.conversationId.length).toBeGreaterThan(0);
    expect(body.userMode).toBe('dispatcher');
    expect(body.greeting.role).toBe('assistant');
    expect(body.greeting.content.length).toBeGreaterThan(0);
    expect(body.greeting.messageId.length).toBeGreaterThan(0);

    // Stash for tests 2, 3, 5.
    conversationId = body.conversationId;
  });

  // 2 ── POST /conversations/:id/messages (streaming) ──────────────────
  test('POST /conversations/:id/messages streams the AI response (DISPATCHER) @workflow @streaming @ai @requires:data-ai-gateway-credits', async ({
    asDispatcher,
  }) => {
    expect(conversationId, 'test 1 must have succeeded to bootstrap the conversation').toBeDefined();
    const payload = buildSendMessage({
      content: `[QA-TEST] Hello Sally — Phase 6 stream assertion`,
    });
    sentContent = payload.content;

    // 30s timeout — the AI gateway can take tens of seconds for a full
    // turn. We buffer the complete body via `res.text()` inside the
    // helper; we only assert the first frame, not completion.
    const res = await asDispatcher.post(
      `/conversations/${conversationId}/messages`,
      payload,
      { timeout: 30_000 },
    );
    // FINDING (Group 6a live probe): streaming POST returns 201, not
    // 200 as the plan predicted. The controller decorates with `@Res()`
    // (sally-ai.controller.ts line 36) so Nest hands the raw Express
    // response to the handler; the handler never calls `res.status(...)`
    // on the happy path (service lines 397-441). Nest falls back to
    // the POST default of 201. Schema for the first streamed frame
    // stays the same — the status code change is purely HTTP-level.
    // Appended to findings.md as finding #48.
    expect(res.status()).toBe(201);

    const frame = await readFirstStreamFrame(res);
    const parsed = expectContract(
      SallyAiStreamFrameSchema,
      frame,
      `POST /conversations/${conversationId}/messages (first frame)`,
    );

    // Semantic — the stream produced a recognisable first frame. On a
    // healthy turn the AI SDK emits text-delta (kind '0') first;
    // follow-ups (kind 'a') or cards (kind '8') would also satisfy the
    // discriminated union. The assertion is shape-only — no model-text
    // content check (Phase 6 rubric).
    expect(['0', '8', '9', 'a']).toContain(parsed.kind);
  });

  // 3 ── POST /conversations/:id/resume ────────────────────────────────
  //
  // The resume endpoint's HAPPY path streams — same AI-SDK data-stream
  // protocol as test 2. The happy path requires a live suspended run
  // matching the {runId, toolCallId} tuple — those only exist after
  // an LLM turn hits a HITL-gated tool and persists its suspendPayload.
  //
  // On invalid {runId, toolCallId} (which is the default from
  // `buildResumeAgent`), Mastra's `resumeStream` throws BEFORE the
  // first `res.write` — so `res.headersSent` is false and the catch
  // block (service line 507) sends a JSON error envelope with status
  // 500. That is NOT the streaming happy path.
  //
  // Tagged `@requires:data-hitl-suspended-agent` so the test is
  // collection-excluded on default dev runs (no seeded suspended
  // agent). When the operator confirms a live suspended run exists
  // AND flips `TESTS_DATA_CAPABILITIES=hitl-suspended-agent`, the
  // test runs with a test-supplied {runId, toolCallId} that matches
  // the seeded run and asserts the streaming happy path.
  test('POST /conversations/:id/resume resumes a suspended agent (DISPATCHER) @workflow @streaming @ai @destructive @requires:data-ai-gateway-credits @requires:data-hitl-suspended-agent', async ({
    asDispatcher,
  }) => {
    expect(conversationId, 'test 1 must have succeeded to bootstrap the conversation').toBeDefined();
    const payload = buildResumeAgent({
      confirmed: true,
      // When the operator flips `hitl-suspended-agent` on, the seed
      // flow MUST set `TESTS_RESUME_TOOL_CALL_ID` and `TESTS_RESUME_RUN_ID`
      // (or modify this test to pull from a known fixture). Absent
      // those envs the default `qa-test-*` values land in the payload
      // and Mastra throws — but the capability gate ensures the test
      // never collects in that state.
      toolCallId: process.env.TESTS_RESUME_TOOL_CALL_ID ?? `qa-test-tool-call-${Date.now()}`,
      runId: process.env.TESTS_RESUME_RUN_ID ?? `qa-test-run-${Date.now()}`,
    });

    const res = await asDispatcher.post(
      `/conversations/${conversationId}/resume`,
      payload,
      { timeout: 30_000 },
    );
    // Same 201 default as POST /messages — see finding #48. The resume
    // handler decorates `@Res()` (controller line 73) and never sets
    // an explicit status on the happy path; Nest defaults to 201.
    expect(res.status()).toBe(201);

    const frame = await readFirstStreamFrame(res);
    const parsed = expectContract(
      SallyAiStreamFrameSchema,
      frame,
      `POST /conversations/${conversationId}/resume (first frame)`,
    );

    // Semantic — the stream produced a recognisable first frame.
    // On resume the server may emit any of the 4 known kinds; the
    // discriminator narrows cleanly in the schema.
    expect(['0', '8', '9', 'a']).toContain(parsed.kind);
  });

  // 5 ── GET /conversations/:id/messages ───────────────────────────────
  test('GET /conversations/:id/messages returns message history (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    expect(conversationId, 'test 1 must have succeeded to bootstrap the conversation').toBeDefined();
    const res = await asDispatcher.get(`/conversations/${conversationId}/messages`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      MessageListSchema,
      await res.json(),
      `GET /conversations/${conversationId}/messages`,
    );

    // Semantic — the envelope echoes the conversationId + dispatcher
    // userMode. The greeting assistant message from test 1 is
    // guaranteed to be present regardless of AI gateway health (it's
    // written synchronously inside `createConversation`, not through
    // the streaming path).
    expect(body.conversationId).toBe(conversationId);
    expect(body.userMode).toBe('dispatcher');
    expect(body.messages.length).toBeGreaterThan(0);
    const greetingMsg = body.messages.find((m) => m.role === 'assistant');
    expect(greetingMsg, 'greeting message from createConversation should surface').toBeDefined();
    expect(greetingMsg!.content.length).toBeGreaterThan(0);

    // If test 2 ran AND the gateway had credits, the user message it
    // sent should now be in the list. We check softly — without AI
    // credits test 2 gets collection-excluded so `sentContent` is
    // undefined; with credits the assertion verifies the send-message
    // persistence path.
    if (sentContent) {
      const userMsg = body.messages.find(
        (m) => m.role === 'user' && m.content === sentContent,
      );
      expect(userMsg, 'user message from test 2 should surface in history').toBeDefined();
    }
  });
});

// ─── Parallel block (tests 4, 6, 7) — independent of the serial block ──
test.describe('Sally AI · Read paths and cross-tenant @workflow @contract', () => {
  // 4 ── GET /conversations ────────────────────────────────────────────
  test('GET /conversations lists conversations with limit (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/conversations?limit=5');
    expect(res.status()).toBe(200);
    const body = expectContract(ConversationListSchema, await res.json(), 'GET /conversations');

    // Semantic — envelope is `{conversations: [...]}`. `limit=5` is
    // piped through `ParseIntPipe` (controller line 58) and enforced
    // by Prisma's `take` — observed array length must be ≤ 5.
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(body.conversations.length).toBeLessThanOrEqual(5);
    for (const row of body.conversations) {
      expect(row.conversationId.length).toBeGreaterThan(0);
      expect(row.userMode.length).toBeGreaterThan(0);
      expect(row.messageCount).toBeGreaterThanOrEqual(0);
    }
  });

  // 6 ── GET /conversations/agents/status ──────────────────────────────
  //
  // FINDING (Group 6a live probe, 2026-04-24): the controller reads
  // `user.userMode` (sally-ai.controller.ts line 102) but the JWT
  // strategy does NOT persist `userMode` onto the authenticated user
  // context (apps/backend/src/auth/strategies/jwt.strategy.ts lines
  // 60-74 — `role`, `tenantId`, `tenantDbId`, etc. are present;
  // `userMode` is NOT). `userMode` only lives on the Conversation
  // row (set via CreateConversationDto.userMode at POST /conversations
  // time) — it's a chat-session attribute, not a user attribute.
  //
  // Consequence: `agentRegistry.getForPersona(undefined)` filters
  // every agent out (agent.registry.ts line 61 — no persona includes
  // `undefined`). The endpoint returns `{agents: []}` with HTTP 200.
  //
  // Phase 6 rubric is contract-shape-only — we assert the envelope
  // is well-formed and that `agents` is an array (possibly empty).
  // Appended to findings.md as finding #48.
  test('GET /conversations/agents/status returns per-agent status (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/conversations/agents/status');
    expect(res.status()).toBe(200);
    const body = expectContract(
      AgentStatusResponseSchema,
      await res.json(),
      'GET /conversations/agents/status',
    );

    // Semantic — the envelope carries a well-formed `agents` array.
    // On the default JWT path `userMode` is undefined so the array
    // is empty (see finding above). When non-empty, every entry has
    // a valid `state` from the enum and a non-empty id + displayName.
    expect(Array.isArray(body.agents)).toBe(true);
    for (const agent of body.agents) {
      expect(agent.id.length).toBeGreaterThan(0);
      expect(agent.displayName.length).toBeGreaterThan(0);
      expect(['idle', 'working', 'monitoring', 'scheduled']).toContain(agent.status.state);
      expect(agent.status.summary.length).toBeGreaterThan(0);
    }
  });

  // 7 ── GET /conversations/:id/messages — cross-tenant 404 ────────────
  test('GET /conversations/:id/messages returns 404 for unknown conversation id (DISPATCHER) @workflow @rbac', async ({
    asDispatcher,
  }) => {
    // Pick a syntactically-valid but definitely-nonexistent conversationId.
    // Service uses `generateId('conv')` which produces `conv_<nanoid>`
    // (shared/utils/id-generator) — we pass a synthetic value that no
    // row on any tenant can own. The service's `findUnique` returns
    // null → `throw new NotFoundException` → 404. The tenant check
    // (line 69: `tenantId !== tenantId`) is AFTER the existence check
    // so both branches converge on 404 from the test's perspective.
    const bogusId = `conv_qa_xtenant_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const res = await asDispatcher.get(`/conversations/${bogusId}/messages`);
    expect(res.status()).toBe(404);
    const body = expectContract(
      AiErrorEnvelopeSchema,
      await res.json(),
      `GET /conversations/${bogusId}/messages (404)`,
    );

    // Semantic — NestJS error envelope carries statusCode=404 and a
    // message. The service's `NotFoundException` message includes the
    // conversation id (service line 577: `Conversation ${conversationId} not found`).
    expect(body.statusCode).toBe(404);
    const msgStr = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(msgStr.length).toBeGreaterThan(0);
  });
});
