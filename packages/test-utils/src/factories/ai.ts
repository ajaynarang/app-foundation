/**
 * Factories for the Assistant AI domain.
 *
 * Chat-surface factories:
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
 * `userMode` constrained to the known values
 * ('owner' | 'admin' | 'member' | 'super_admin' — see
 * create-conversation.dto.ts). Default 'member' — the broadest tenant
 * role; the service falls back to the default greeting for unknown keys,
 * but passing a canonical value makes the intent explicit.
 */
export function buildCreateConversation(overrides: { userMode?: string } & Record<string, unknown> = {}) {
  return {
    userMode: 'member',
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

// ── VOICE ────────────────────────────────────────────────────────────

/**
 * `POST /voice/token` — `VoiceTokenDto` requires only `conversationId`
 * (voice-token.dto.ts). Tests pass the id of an assistant AI conversation
 * created via `POST /conversations` so the ownership check on
 * `voice.service.ts:69` (`conversation.userId !== user.id`) passes.
 */
export function buildVoiceTokenRequest(overrides: { conversationId?: string } & Record<string, unknown> = {}) {
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
 * — the endpoint short-circuits inside `AssistantAiService.generateResponse`
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
    text: overrides.text ?? '[QA-TEST] Hello Assistant',
    userId: overrides.userId ?? `qa-test-user-${unique('uid')}`,
    tenantId: overrides.tenantId ?? 1,
    ...overrides,
  };
}

// ── PHASE 6 GROUP 6d — MCP EXTERNAL SURFACE ──────────────────────────

/**
 * Bogus API key used to drive the `POST /mcp/apikey` 401 path
 * (`ApiKeyAuthGuard` rejects). The `sk_live_` prefix matches the live
 * Assistant API-key shape (validators inspect the prefix before hashing the
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
export function buildMcpStepUpRequest(overrides: { pin?: string } & Record<string, unknown> = {}) {
  return {
    pin: '1234',
    ...overrides,
  };
}
