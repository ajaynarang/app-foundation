/**
 * Voice (Phase 6 Group 6c — 3 tests on VoiceController).
 *
 * Covers all 3 endpoints on
 * `apps/backend/src/domains/ai/voice/voice.controller.ts`:
 *
 *    23. GET  /voice/status               — availability flag (no env leakage)
 *    24. POST /voice/token                — LiveKit access token (or 503)
 *    25. POST /voice/internal/respond     — forked-agent NDJSON streaming
 *
 * Auth model:
 *   - Tests 23 + 24: `asDispatcher`. Class-level guard inherits global
 *     JWT; methods carry `@Roles(OWNER, ADMIN, DISPATCHER, DRIVER, CUSTOMER, SUPER_ADMIN)`.
 *   - Test 25: `asAnonymous` + `x-voice-agent-secret` header. The
 *     `internal/respond` endpoint is `@Public()` (line 59) and gated
 *     ENTIRELY on the shared secret. The forked LiveKit agent calls
 *     this endpoint from localhost — tests simulate that call.
 *
 * Availability state (test 23 → 24):
 *   The status endpoint deliberately returns ONLY `{available: boolean}`
 *   (controller line 35-36). It does NOT leak the missing env var names
 *   or the underlying feature flag state. Test 24 must therefore branch
 *   on the test-23 outcome:
 *     - `available: true`  → POST /voice/token returns 201 + VoiceTokenSchema.
 *     - `available: false` → POST /voice/token returns 503 + error envelope.
 *   We pre-fetch status inside test 24 to choose the assertion branch.
 *
 * Test 24 — conversation ownership:
 *   `voice.service.ts::generateToken` (lines 55-71) demands a Conversation
 *   row owned by the caller (`conversation.userId === user.id` AND
 *   `conversation.tenantId === tenantId`). Test 24 creates a fresh
 *   conversation via `POST /conversations` to satisfy ownership when
 *   voice is available. When voice is NOT available, the controller
 *   throws ServiceUnavailableException BEFORE any DB lookup (line 43-45)
 *   so a bogus conversationId is fine for the 503 branch.
 *
 * Test 25 — internal/respond:
 *   Tagged `@requires:data-ai-gateway-credits @requires:data-voice-agent-secret`.
 *   The shared secret is set in Doppler `sally-backend/dev` (verified
 *   2026-04-27 — VOICE_AGENT_SECRET is 47 chars). The endpoint streams
 *   NDJSON (one JSON document per line — NOT the AI-SDK prefix:json
 *   protocol). `readFirstNdjsonFrame` parses the first line as JSON.
 *
 * Cleanup:
 *   - Test 24: the conversation row is created by the dispatcher and
 *     persists until tenant-reset. No public DELETE for AI conversations.
 *   - Tests 23 + 25: read-only / no DB writes.
 *
 * Source-of-truth pointers:
 *   - apps/backend/src/domains/ai/voice/voice.controller.ts
 *   - apps/backend/src/domains/ai/voice/voice.service.ts
 *   - apps/backend/src/domains/ai/voice/dto/voice-token.dto.ts
 *   - apps/backend/src/domains/ai/voice/dto/voice-respond.dto.ts
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildCreateConversation,
  buildVoiceTokenRequest,
  buildVoiceInternalRequest,
} from '@sally/test-utils/factories';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';
import { readFirstNdjsonFrame } from './_helpers';

const {
  VoiceStatusSchema,
  VoiceTokenSchema,
  VoiceUnavailableErrorSchema,
  VoiceInternalRespondFrameSchema,
  ConversationRowSchema,
} = AiSchemas;

test.describe('Voice · status + token @workflow', () => {
  // 23 ── GET /voice/status ──────────────────────────────────────────
  test('GET /voice/status returns availability flag (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/voice/status');
    expect(res.status()).toBe(200);
    const body = expectContract(VoiceStatusSchema, await res.json(), 'GET /voice/status');

    // Semantic — the response is a strict 1-key envelope. The controller
    // (line 35-36) deliberately strips `missing[]` from the service
    // result so env var names are never leaked. `available` is a
    // boolean — the type narrowing is the contract.
    expect(typeof body.available).toBe('boolean');
  });

  // 24 ── POST /voice/token ──────────────────────────────────────────
  //
  // Branches on `available` from GET /voice/status:
  //   - true:  201 + VoiceTokenSchema (token + url present).
  //   - false: 503 + VoiceUnavailableErrorSchema.
  // The branch is determined inside the test so the suite passes
  // regardless of LiveKit env state.
  test('POST /voice/token returns LiveKit token or 503 (DISPATCHER) @workflow @destructive', async ({
    asDispatcher,
  }) => {
    // Pre-fetch status to pick the branch. The status endpoint is
    // hit independently from test 23 — this keeps test 24 self-contained.
    const statusRes = await asDispatcher.get('/voice/status');
    expect(statusRes.status()).toBe(200);
    const status = expectContract(VoiceStatusSchema, await statusRes.json(), 'GET /voice/status (pre)');

    if (status.available) {
      // Happy path — need a real conversation owned by the caller.
      // `voice.service.ts:69` enforces `conversation.userId === user.id`.
      const convRes = await asDispatcher.post('/conversations', buildCreateConversation({ userMode: 'dispatcher' }));
      expect(convRes.status()).toBe(201);
      const conv = expectContract(ConversationRowSchema, await convRes.json(), 'POST /conversations (token bootstrap)');

      const payload = buildVoiceTokenRequest({ conversationId: conv.conversationId });
      const res = await asDispatcher.post('/voice/token', payload);
      // Same `@Res()`-less + 201 default as other Sally AI POSTs —
      // controller has no `@HttpCode(...)` decorator.
      expect(res.status()).toBe(201);
      const body = expectContract(VoiceTokenSchema, await res.json(), 'POST /voice/token (available)');

      // Semantic — `token` is the LiveKit JWT (long-ish); `url` is the
      // configured LIVEKIT_URL. Both must be non-empty strings; the
      // schema's `.min(1)` validates that.
      expect(body.token.length).toBeGreaterThan(20);
      expect(body.url.length).toBeGreaterThan(0);
    } else {
      // Unavailable — the controller throws ServiceUnavailableException
      // BEFORE reading the body's conversationId. Pass a bogus DTO; the
      // 503 short-circuit fires anyway.
      const payload = buildVoiceTokenRequest();
      const res = await asDispatcher.post('/voice/token', payload);
      expect(res.status()).toBe(503);
      const body = expectContract(
        VoiceUnavailableErrorSchema,
        await res.json(),
        'POST /voice/token (unavailable)',
      );

      // Semantic — message contains "Voice mode not available" (line 44).
      const msgStr = Array.isArray(body.message) ? body.message.join(' ') : body.message;
      expect(msgStr.toLowerCase()).toContain('voice mode not available');
    }
  });
});

test.describe('Voice · internal/respond (forked-agent surface) @workflow', () => {
  // 25 ── POST /voice/internal/respond ───────────────────────────────
  //
  // Tagged on TWO data capabilities — the LLM credits AND the shared
  // secret env var. Both must be present for the test to collect.
  test('POST /voice/internal/respond streams a voice response (ANONYMOUS + shared secret) @workflow @streaming @ai @public @requires:data-ai-gateway-credits @requires:data-voice-agent-secret', async ({
    asAnonymous,
  }) => {
    // Read the secret from process.env at TEST RUNTIME — Doppler injects
    // it into the test process via `pnpm test:qa:local`. The
    // `@requires:data-voice-agent-secret` tag ensures the test is
    // collection-excluded when the secret is absent.
    const secret = process.env.VOICE_AGENT_SECRET;
    expect(secret, 'VOICE_AGENT_SECRET must be set when @requires:data-voice-agent-secret is active').toBeTruthy();

    const payload = buildVoiceInternalRequest();
    const res = await asAnonymous.post('/voice/internal/respond', payload, {
      headers: { 'x-voice-agent-secret': secret as string },
      timeout: 30_000,
    });
    // The controller decorates with `@Res()` (line 61) and never sets
    // an explicit status on the happy path — Nest defaults to 201 for POST.
    expect(res.status()).toBe(201);

    // First NDJSON line — single JSON document, NOT the AI-SDK
    // `<prefix>:<json>` protocol. Use `readFirstNdjsonFrame`.
    const frame = await readFirstNdjsonFrame(res);
    const parsed = expectContract(
      VoiceInternalRespondFrameSchema,
      frame,
      'POST /voice/internal/respond (first frame)',
    );

    // Semantic — `type` is one of the 5 enum values. On a stale
    // conversationId (the default factory id is bogus), the service
    // emits a `text-delta` error frame — the shape still validates.
    // Phase 6 rubric is contract-only.
    expect(['text-delta', 'card', 'suspend', 'blocked', 'complete']).toContain(parsed.type);
    expect(typeof parsed.data).toBe('string');
  });
});
