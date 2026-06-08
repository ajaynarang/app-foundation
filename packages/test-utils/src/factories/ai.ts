/**
 * Factories for the Sally AI domain (Phase 6 — groups 6a-6f).
 *
 * Group 6a owns the chat-surface factories:
 *   - buildCreateConversation  → POST /conversations       (CreateConversationDto)
 *   - buildSendMessage         → POST /conversations/:id/messages (SendMessageDto)
 *   - buildResumeAgent         → POST /conversations/:id/resume (ResumeAgentDto)
 *
 * Each factory matches the class-validator DTO on
 * `apps/backend/src/domains/ai/assistant/dto/*` exactly — missing required
 * fields or out-of-enum values trip the DTO layer with a 400 before the
 * service runs.
 *
 * Factories are deliberately thin; the test-utils style (see
 * `factories/integrations.ts` for precedent) keeps the surface minimal
 * and lets individual tests override any field.
 */
import { unique } from './common.js';

/**
 * POST /conversations — CreateConversationDto requires a non-empty
 * `userMode` constrained to the 8 known values
 * (create-conversation.dto.ts line 5). Default 'dispatcher' — matches
 * the role fixture used by every Group 6a test; service line 108 falls
 * back to the dispatcher greeting for unknown keys, but passing the
 * canonical value makes the intent explicit.
 */
export function buildCreateConversation(
  overrides: { userMode?: string } & Record<string, unknown> = {},
) {
  return {
    userMode: 'dispatcher',
    ...overrides,
  };
}

/**
 * POST /conversations/:id/messages — SendMessageDto requires:
 *   - `inputMode`: 'text' | 'voice' (send-message.dto.ts line 46)
 *   - at least ONE of { `content`, `promptKey` } (cross-field validator)
 *   - `content` ≤ 4000 chars when provided
 *   - `promptKey` ≤ 128 chars when provided
 *   - `promptVariables` is optional `Record<string, string>`
 *
 * Default is the `content`-branch so tests can assert a real chat turn
 * without needing a registered prompt template. The `[QA-TEST]` prefix
 * flags the row in DB inspection (same convention as integrations).
 */
export function buildSendMessage(
  overrides: {
    content?: string;
    inputMode?: 'text' | 'voice';
    promptKey?: string;
    promptVariables?: Record<string, string>;
  } & Record<string, unknown> = {},
) {
  return {
    content: `[QA-TEST] ${unique('message')}`,
    inputMode: 'text' as const,
    ...overrides,
  };
}

/**
 * POST /conversations/:id/resume — ResumeAgentDto
 * (resume-agent.dto.ts):
 *   - `confirmed`: boolean, REQUIRED.
 *   - `toolCallId`: string, optional.
 *   - `runId`: string, optional.
 *
 * Default `confirmed: false` is the "declined confirmation" branch —
 * semantically identical shape to `confirmed: true` at the HTTP level
 * (both enter `resumeStream`). `toolCallId` / `runId` defaults are
 * bogus QA placeholders that make Mastra's `resumeStream` throw when
 * no live suspended run matches — the test asserts the error-path
 * shape (500 envelope OR streamed error frame; see spec test 3 doc).
 */
export function buildResumeAgent(
  overrides: {
    confirmed?: boolean;
    toolCallId?: string;
    runId?: string;
  } & Record<string, unknown> = {},
) {
  return {
    confirmed: false,
    toolCallId: `qa-test-tool-call-${unique('tc')}`,
    runId: `qa-test-run-${unique('run')}`,
    ...overrides,
  };
}

// ── PHASE 6 GROUP 6b — DOCUMENT INTELLIGENCE / JOBS ─────────────────

/**
 * Minimal valid PDF (1 page, no content) — ~190 bytes inline.
 *
 * Encoded as latin1 so every byte round-trips exactly (UTF-8 would
 * mangle the structural delimiters). The trailer points to a 4-entry
 * xref with the catalog → pages → page object chain. This is the
 * smallest PDF the controller's `validatePdf` (mimetype check only —
 * line 124) and BullMQ enqueue path will accept WITHOUT triggering
 * the parser service. The async parser will later fail, but the
 * synchronous 202 envelope is what Phase 6 asserts (the QA scope is
 * the enqueue contract, NOT the parse outcome — see plan §2 OUT).
 *
 * Each call returns a UNIQUE filename so the SHA-256 hash differs
 * across runs — `processFile` (controller line 149) hashes
 * `Buffer.concat([file.buffer, Buffer.from(strategy)])`, but identical
 * test runs would COLLIDE on hash and trip the `ConflictException`
 * dup-detection (line 160). The unique filename forces a different
 * `originalname` which doesn't change the buffer — so strategy alone
 * isn't enough; we also append a random byte to the buffer to
 * guarantee a fresh hash per call.
 */
const MINIMAL_PDF_TEMPLATE = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000052 00000 n
0000000101 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
148
%%EOF`;

export function buildRateconUploadBuffer(): {
  buffer: Buffer;
  filename: string;
  mimeType: 'application/pdf';
} {
  // Append a random comment line BEFORE %%EOF so the hash differs across
  // calls; PDF parsers ignore arbitrary bytes between objects (the xref
  // table's offsets aren't validated by the controller). This guarantees
  // a fresh inputHash per test run.
  const tag = unique('ratecon');
  const body = MINIMAL_PDF_TEMPLATE.replace('%%EOF', `%${tag}\n%%EOF`);
  return {
    buffer: Buffer.from(body, 'latin1'),
    filename: `${tag}.pdf`,
    mimeType: 'application/pdf',
  };
}

/**
 * Minimal 1×1 white JPEG — ~134 bytes inline, base64-decoded.
 *
 * The fuel-receipt parser passes the raw buffer to the AI gateway as
 * a `file` part with mediaType=`image/jpeg`. Tests tagged
 * `@requires:data-ai-gateway-credits` are collection-excluded by
 * default so this stub is never sent to the LLM on a normal run.
 *
 * This is a known-good 1×1 white-pixel JPEG (standard test fixture).
 */
const MINIMAL_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AB//Z';

export function buildFuelReceiptUploadBuffer(): {
  buffer: Buffer;
  filename: string;
  mimeType: 'image/jpeg';
} {
  return {
    buffer: Buffer.from(MINIMAL_JPEG_BASE64, 'base64'),
    filename: `${unique('fuel-receipt')}.jpg`,
    mimeType: 'image/jpeg',
  };
}

/**
 * `POST /jobs/:jobId/retry` — controller takes no body (line 97), but the
 * Playwright `post(url, undefined)` shape requires `data` to be defined-ish
 * to send a content-length-0 POST cleanly. Empty object is the safe
 * default; Nest discards it (no DTO).
 */
export function buildJobRetry(): Record<string, never> {
  return {};
}

/**
 * `PATCH /jobs/:jobId/dismiss` — same shape as retry (no body).
 */
export function buildJobDismiss(): Record<string, never> {
  return {};
}

// ── PHASE 6 GROUP 6c — PROSPECT + VOICE ─────────────────────────────

/**
 * `POST /prospect/conversations` — controller takes NO body (line 18:
 * `async createConversation()`). Returning `{}` keeps the
 * `RoleApiClient.post(url, data)` signature happy without sending fields
 * the service ignores anyway. The conversation row's `userMode` is
 * always set server-side to `'prospect'` (service line 33).
 */
export function buildProspectConversation(): Record<string, never> {
  return {};
}

/**
 * `POST /prospect/conversations/:id/messages` — same `SendMessageDto`
 * shape as the dispatcher endpoint. Tests use the `content`-branch with
 * a short `[QA-TEST]` prefix that flags the row in DB inspection. Default
 * inputMode is `text`; voice tests would pass `voice` explicitly.
 */
export function buildProspectMessage(
  overrides: {
    content?: string;
    inputMode?: 'text' | 'voice';
  } & Record<string, unknown> = {},
) {
  return {
    content: `[QA-TEST] ${unique('prospect-msg')}`,
    inputMode: 'text' as const,
    ...overrides,
  };
}

/**
 * `POST /voice/token` — `VoiceTokenDto` requires only `conversationId`
 * (voice-token.dto.ts). Tests pass the id of a Sally AI conversation
 * created via `POST /conversations` so the ownership check on
 * `voice.service.ts:69` (`conversation.userId !== user.id`) passes.
 */
export function buildVoiceTokenRequest(
  overrides: { conversationId?: string } & Record<string, unknown> = {},
) {
  return {
    conversationId: overrides.conversationId ?? `qa-test-conv-${unique('vt')}`,
    ...overrides,
  };
}

/**
 * `POST /voice/internal/respond` — `VoiceRespondDto` requires
 * `conversationId`, `text`, `userId` (string), `tenantId` (positive int).
 * The endpoint is reached via the LiveKit forked-agent process, so the
 * caller must supply realistic values. Defaults are bogus QA placeholders
 * — the endpoint short-circuits inside `SallyAiService.generateResponse`
 * with a generic error frame on a stale conversationId, but the FIRST
 * frame's contract shape (`{type, data}`) holds either way.
 */
export function buildVoiceInternalRequest(
  overrides: {
    conversationId?: string;
    text?: string;
    userId?: string;
    tenantId?: number;
  } & Record<string, unknown> = {},
) {
  return {
    conversationId: overrides.conversationId ?? `qa-test-conv-${unique('vir')}`,
    text: overrides.text ?? '[QA-TEST] Hello Sally',
    userId: overrides.userId ?? `qa-test-user-${unique('uid')}`,
    tenantId: overrides.tenantId ?? 1,
    ...overrides,
  };
}

// ── PHASE 6 GROUP 6d — MCP EXTERNAL SURFACE ──────────────────────────

/**
 * Bogus API key used to drive the `POST /mcp/apikey` 401 path
 * (`ApiKeyAuthGuard` rejects). The `sk_live_` prefix matches the live
 * Sally API-key shape (validators inspect the prefix before hashing the
 * secret), so the request reaches the secret-validation branch — not
 * an early format reject. The suffix is deliberately gibberish so the
 * SHA lookup misses every row regardless of tenant.
 *
 * Used by Phase 6 Group 6d test 29.
 */
export const MCP_BOGUS_API_KEY = 'sk_live_qa_definitely_invalid_for_testing';

/**
 * Stable sentinel UUID used for non-existent HITL challenge token
 * lookups. The HITL controller's `findUnique({where: {id: token}})`
 * (hitl-step-up.controller.ts:37) returns null on this UUID across
 * every tenant, so the service throws `NotFoundException('Challenge
 * not found')` deterministically.
 *
 * Sentinel chosen over `crypto.randomUUID()` for two reasons:
 * 1. Deterministic — failing reproductions can re-use the same token.
 * 2. Stable in test logs / Playwright traces, easier to grep.
 *
 * Used by Phase 6 Group 6d tests 30 and 31.
 */
export const MCP_BOGUS_HITL_TOKEN = '00000000-0000-0000-0000-000000000000';

/**
 * `POST /mcp/hitl/:token/step-up` — `StepUpDto` (step-up.dto.ts) requires
 * a 4-digit numeric `pin`. Default '1234' is the canonical demo PIN.
 *
 * Tests in Group 6d use this factory only for shape-correct payloads —
 * the test 32 happy-path is gated on `@requires:data-hitl-token` (a real
 * challenge must exist), and the no-PIN branch (test 32 default) returns
 * 400 BEFORE the PIN check runs (controller line 104). The factory is
 * here so future Phase 8/9 tests can reuse the canonical shape.
 */
export function buildMcpStepUpRequest(
  overrides: { pin?: string } & Record<string, unknown> = {},
) {
  return {
    pin: '1234',
    ...overrides,
  };
}
