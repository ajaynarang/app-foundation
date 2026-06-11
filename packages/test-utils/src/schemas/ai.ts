/**
 * API Contracts for the Assistant AI domain (Phase 6 — groups 6a-6f).
 *
 * Group 6a owns the CHAT-surface schemas consumed by `tests/api/ai/assistant-ai.spec.ts`:
 *
 *   - ConversationRowSchema            — POST /conversations
 *   - ConversationListItemSchema,
 *     ConversationListSchema            — GET  /conversations
 *   - MessageRowSchema, MessageListSchema
 *                                       — GET  /conversations/:id/messages
 *   - AgentStatusItemSchema,
 *     AgentStatusResponseSchema         — GET  /conversations/agents/status
 *   - AssistantAiStreamFrameSchema          — POST /conversations/:id/messages
 *                                         POST /conversations/:id/resume (streaming)
 *
 * All schemas are hand-written under `.strict()` and pinned against the
 * live service projection on `apps/backend/src/domains/ai/assistant/assistant.service.ts`
 * (verified against the assistant service projection).
 *
 * Streaming protocol — the AI SDK data-stream protocol
 * ---------------------------------------------------
 * Both `streamMessage` and `resumeAgent` return Express raw responses
 * that emit lines of the form:
 *
 *   `<prefix>:<json>\n`
 *
 * where `<prefix>` is a single character from `{0, 8, 9, a}`
 * (assistant.service.ts lines 415–427 + pipe-agent-response.ts lines 66/79/89/105):
 *
 *   0 : <JSON string>         — text-delta chunk (model token / block text)
 *   8 : <JSON object>         — tool-emitted card metadata
 *   9 : <JSON object>         — HITL suspend payload (runId + tool-call info)
 *   a : <JSON array>          — parsed follow-up prompts
 *
 * So the FIRST LINE of a drained stream is NOT a single JSON document —
 * it's a 1-char discriminator, a colon, then a JSON token. Tests call
 * `readFirstStreamFrame(res)` from `tests/api/ai/_helpers.ts` which
 * splits the line on the first colon and returns `{ kind, payload }`.
 *
 * `AssistantAiStreamFrameSchema` below models that normalised shape (NOT
 * the raw line). A strict discriminated union over the 4 known kinds.
 */
import { z } from 'zod';
import { isoDateString, stringId } from './helpers.js';

// ── CONVERSATION ROW (POST /conversations) ───────────────────────────

/**
 * POST /conversations response — see `assistant.service.ts::createConversation`
 * (lines 131–143). Projection:
 *   { conversationId, userMode, createdAt, greeting: {...} }
 *
 * `greeting` is an embedded assistant message created inside the same
 * Prisma transaction. Fields map 1:1 to `MessageRowSchema` minus the
 * optional `intent`/`card`/`action` columns (the greeting is plain text).
 * The service explicitly emits `messageId`, `role`, `content`, `inputMode`,
 * `speakText`, `createdAt` — so the greeting envelope is pinned against
 * those 6 keys under `.strict()`.
 */
export const ConversationGreetingSchema = z
  .object({
    messageId: stringId,
    role: z.string(),
    content: z.string(),
    inputMode: z.string(),
    // `speakText` mirrors `content` at create-time (service line 122) but
    // is modelled nullable because downstream turns may omit it.
    speakText: z.string().nullable(),
    createdAt: isoDateString,
  })
  .strict();

export const ConversationRowSchema = z
  .object({
    conversationId: stringId,
    userMode: z.string(),
    createdAt: isoDateString,
    greeting: ConversationGreetingSchema,
  })
  .strict();

// ── CONVERSATION LIST (GET /conversations) ───────────────────────────

/**
 * GET /conversations response — `assistant.service.ts::listConversations`
 * lines 530–540. Each row is:
 *   { conversationId, userMode, title, messageCount, lastMessageAt, createdAt }
 *
 * The service emits `title` as a nullable string (`c.title` can be NULL
 * until the first user message auto-fills it at line 193). `lastMessageAt`
 * defaults to `createdAt.toISOString()` when there are zero messages.
 */
export const ConversationListItemSchema = z
  .object({
    conversationId: stringId,
    userMode: z.string(),
    title: z.string().nullable(),
    messageCount: z.number().int().nonnegative(),
    lastMessageAt: isoDateString,
    createdAt: isoDateString,
  })
  .strict();

/**
 * The envelope is `{ conversations: [...] }` (line 530). NOT a bare array
 * — future Phase 5/6 groups should NOT confuse this with the integrations
 * list (which IS a bare array).
 */
export const ConversationListSchema = z
  .object({
    conversations: z.array(ConversationListItemSchema),
  })
  .strict();

// ── MESSAGE ROW (GET /conversations/:id/messages) ────────────────────

/**
 * Single message row from `assistant.service.ts::getMessages` (lines 586–597).
 * Projection includes these columns from `ConversationMessage`:
 *   messageId, role, content, inputMode, intent, card, action, speakText, createdAt
 *
 * `intent` / `card` / `action` are nullable JSON columns. `speakText` is
 * a nullable scalar. `card` + `action` are arbitrary JSON payloads (tool
 * results / card metadata) — modelled `.unknown().nullable()` to stay
 * contract-shape-only per the Phase 6 rubric (no model-content assertions).
 */
export const MessageRowSchema = z
  .object({
    messageId: stringId,
    role: z.string(),
    content: z.string(),
    inputMode: z.string(),
    intent: z.unknown().nullable(),
    card: z.unknown().nullable(),
    action: z.unknown().nullable(),
    speakText: z.string().nullable(),
    createdAt: isoDateString,
  })
  .strict();

/**
 * GET /conversations/:id/messages envelope — `assistant.service.ts:582-598`.
 * `{ conversationId, userMode, title, messages: [...] }`.
 */
export const MessageListSchema = z
  .object({
    conversationId: stringId,
    userMode: z.string(),
    title: z.string().nullable(),
    messages: z.array(MessageRowSchema),
  })
  .strict();

// ── AGENT STATUS (GET /conversations/agents/status) ──────────────────

/**
 * Individual domain-agent status, mirroring
 * `agent.types.ts::AgentStatus` (lines 61–65):
 *   { state: 'idle' | 'working' | 'monitoring' | 'scheduled',
 *     summary: string,
 *     nextRun?: string }
 *
 * The controller wraps each into `{id, displayName, status}`
 * (assistant.controller.ts lines 102–109). `id` is an AGENT_IDS value
 * — modelled `z.string()` (not a strict enum) because new agents can
 * land without requiring a test-utils bump.
 */
export const AgentStatusSchema = z
  .object({
    state: z.enum(['idle', 'working', 'monitoring', 'scheduled']),
    summary: z.string(),
    nextRun: z.string().optional(),
  })
  .strict();

export const AgentStatusItemSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    status: AgentStatusSchema,
  })
  .strict();

/**
 * GET /conversations/agents/status — `{ agents: [...] }`
 * (assistant.controller.ts). The returned list is filtered by
 * `agent.personas.includes(userMode)` (agent.registry.ts), so each
 * persona sees only the agents that declare it.
 */
export const AgentStatusResponseSchema = z
  .object({
    agents: z.array(AgentStatusItemSchema),
  })
  .strict();

// ── STREAMING FIRST-FRAME (POST /conversations/:id/messages + resume) ─

/**
 * Normalised AI-SDK data-stream frame (see file header).
 *
 * `readFirstStreamFrame(res)` parses the first non-empty line of the
 * drained stream body and returns `{ kind, payload }`, where `kind` is
 * the 1-char prefix and `payload` is the parsed JSON token.
 *
 * Four known kinds:
 *   - kind '0' — text-delta. Payload is a string (JSON.stringify of a
 *     token or fragment). Default first-frame on a happy turn.
 *   - kind '8' — card metadata. Payload is an object (tool `_card`
 *     result). Only emitted if the first observable event is a card —
 *     in practice agents emit text first.
 *   - kind '9' — HITL suspend. Payload is an object with `runId` +
 *     tool-call info. The resume endpoint's observable first frame
 *     when the initial turn suspended on a confirm-action.
 *   - kind 'a' — follow-ups array. Parsed follow-up prompts. Payload
 *     is a string[].
 *
 * Modelled as a discriminated union so test assertions narrow cleanly:
 *
 *   const frame = readFirstStreamFrame(res);
 *   AssistantAiStreamFrameSchema.parse(frame);
 *   if (frame.kind === '0') expect(typeof frame.payload).toBe('string');
 */
export const AssistantAiStreamFrameSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('0'),
      payload: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('8'),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal('9'),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      kind: z.literal('a'),
      payload: z.array(z.string()),
    })
    .strict(),
]);

export type AssistantAiStreamFrame = z.infer<typeof AssistantAiStreamFrameSchema>;

// ── ERROR ENVELOPE (shared for cross-tenant 404 assertion) ───────────

/**
 * the platform's global exception filter envelope (not the default Nest one).
 * Live-probed 2026-04-24: backend emits
 *   { statusCode, timestamp, path, method, detail, message }
 * on any thrown `HttpException`. The filter enriches the default Nest
 * body with observability fields (`timestamp` ISO, `path`, `method`,
 * `detail`) — used by the cross-tenant 404 test (test 7) and by any
 * later Group 6b-6f test that asserts an error envelope.
 *
 * `message` can be a string OR an array of strings (validation errors).
 * `error` is the legacy Nest shorthand; included `.optional()` because
 * the platform filter omits it but stock Nest responses retain it.
 */
export const AiErrorEnvelopeSchema = z
  .object({
    statusCode: z.number().int(),
    message: z.union([z.string(), z.array(z.string())]),
    timestamp: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    detail: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

// ── PHASE 6 GROUP 6c — AGENT ACTIVITY + DEV SCOPES ───────────────────

/**
 * Single agent-activity row from the redacted projection in
 * `agent-activity.service.ts::project` (lines 113-149) — never includes
 * argsRaw, piiReadFlag, tenantId or requestId. The DB column is a uuid,
 * but `principalId` is the prefixed audit-log form (e.g. `user:123`,
 * `oauth:<clientId>`). `argsRedacted` is an arbitrary JSON record.
 *
 * Mirrors `AgentActivityRowSchema` in shared-types/ai/agent-activity.schema.ts
 * (verified against the agent-activity service projection).
 */
export const AgentActivityRowSchema = z
  .object({
    id: z.string().uuid(),
    principalKind: z.enum(['user', 'desk_responsibility', 'oauth_client', 'api_key']),
    principalId: z.string().min(1),
    principalLabel: z.string(),
    toolName: z.string().min(1),
    scopeRequired: z.string().min(1),
    hitlTier: z.enum(['none', 'standard', 'sensitive']),
    argsDigest: z.string(),
    argsRedacted: z.record(z.string(), z.unknown()),
    success: z.boolean(),
    durationMs: z.number().int().nullable(),
    error: z.string().nullable(),
    outputSummary: z.string().nullable(),
    confirmationTokenId: z.string().nullable(),
    langfuseTraceId: z.string().nullable(),
    createdAt: isoDateString,
  })
  .strict();

/**
 * `GET /agent-activity` response — `agent-activity.service.ts:87-90`:
 *   { rows: AgentActivityRow[], nextCursor: string | null }
 *
 * NOTE: the plan §6 line 210 sketched `items[]` but live shape is `rows`.
 * `nextCursor` is the createdAt ISO string of the last row (cursor-based;
 * pass back as `?cursor=...` to fetch the next page).
 */
export const AgentActivityListSchema = z
  .object({
    rows: z.array(AgentActivityRowSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

/**
 * Single scope row from `developer-scopes.controller.ts::list` (lines 36-49).
 * `scope` is one of the 32 entries in `AgentScopeSchema` MINUS the
 * `NEVER_EXTERNAL_SCOPES` filter (`platform:admin` is excluded — line 33).
 * `sampleTools` may be the live tool list from the registry (up to 4) or
 * the static fallback from `SCOPE_DESCRIPTIONS`.
 */
export const DeveloperScopeRowSchema = z
  .object({
    scope: z.string().min(1),
    summary: z.string().min(1),
    grantsPlainEnglish: z.string().min(1),
    hitlTier: z.enum(['none', 'standard', 'sensitive']),
    sampleTools: z.array(z.string()),
  })
  .strict();

/**
 * `GET /developer/scopes` response — controller returns the array directly
 * (line 32: `list(): DeveloperScopeEntry[]`). NOT a wrapped envelope.
 */
export const DeveloperScopesResponseSchema = z.array(DeveloperScopeRowSchema);

// ── PHASE 6 GROUP 6c — VOICE ─────────────────────────────────────────

/**
 * `GET /voice/status` response — `voice.controller.ts::getStatus` (line 35)
 * deliberately strips the `missing[]` array from `VoiceService.getStatus`
 * so the public response only carries `{available: boolean}`. The missing
 * env var names (LIVEKIT_URL, LIVEKIT_API_KEY, etc.) are NEVER leaked.
 */
export const VoiceStatusSchema = z
  .object({
    available: z.boolean(),
  })
  .strict();

/**
 * `POST /voice/token` happy-path response — `voice.service.ts::generateToken`
 * lines 134 returns `{token, url}`. The plan §6 line 216 hinted at `roomId`
 * + `identity` but the live service projection is just two fields. Tests
 * derive `roomId` semantically from `voice-${conversationId}` if needed —
 * the response itself only carries token + url.
 */
export const VoiceTokenSchema = z
  .object({
    token: z.string().min(1),
    url: z.string().min(1),
  })
  .strict();

/**
 * 503 envelope when voice is unavailable — controller line 44 throws
 * `ServiceUnavailableException('Voice mode not available')`. the platform's
 * global exception filter wraps it in the standard envelope (same shape
 * as `AiErrorEnvelopeSchema`, but `statusCode` is the literal 503).
 */
export const VoiceUnavailableErrorSchema = z
  .object({
    statusCode: z.literal(503),
    message: z.union([z.string(), z.array(z.string())]),
    timestamp: z.string().optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    detail: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

/**
 * `POST /voice/internal/respond` first NDJSON frame —
 * `voice.controller.ts::internalRespond` (lines 89-91) writes
 * `JSON.stringify(chunk) + '\n'` per chunk. Each chunk has shape
 * `{type: 'text-delta' | 'card' | 'suspend' | 'blocked' | 'complete', data: string}`
 * (voice.service.ts::generateVoiceResponse return type, line 149-152).
 *
 * UNLIKE the chat streaming protocol (`<prefix>:<json>`), voice frames are
 * a SINGLE JSON document per line — `readFirstStreamFrame` (which splits
 * on a colon) WILL NOT WORK here. Tests parse the first line via
 * `JSON.parse(line)` directly.
 */
export const VoiceInternalRespondFrameSchema = z
  .object({
    type: z.enum(['text-delta', 'card', 'suspend', 'blocked', 'complete']),
    data: z.string(),
  })
  .strict();

// ── PHASE 6 GROUP 6d — MCP EXTERNAL SURFACE ──────────────────────────
//
// The MCP external surface (`apps/backend/src/domains/ai/mcp-server/*`)
// exposes 4+2 endpoints that Phase 6 Group 6d covers ENTIRELY through
// error-path assertions — zero LLM cost, zero positive-flow assertions
// (those are deferred to Phase 8/9 once real OAuth + PIN seeding lands).
//
// Three distinct envelope shapes show up across the 7 tests:
//
// 1. `OAuthTokenGuard` 401 — `oauth-token.guard.ts:28-32` throws
//    `UnauthorizedException({error: 'invalid_token', error_description: '...'})`.
//    The HttpException's response body is the OBJECT form, so the
//    `HttpExceptionFilter` (else branch, line 73-85) spreads it onto
//    the envelope. Notably the obj does NOT carry `message` or `detail`,
//    so the filter falls back to `detail: 'Request failed'` (line 80).
//    Live (2026-04-27): `{statusCode: 401, timestamp, path, method,
//    detail: "Request failed", error: "invalid_token",
//    error_description: "Bearer token required"}`.
//
// 2. `ApiKeyAuthGuard` 401 — `api-key-auth.guard.ts:23,29` throws
//    `UnauthorizedException('API key required')` or
//    `UnauthorizedException('Invalid, expired, or IP-blocked API key')`.
//    NestJS wraps the string into the standard object form
//    `{statusCode: 401, message: '<msg>', error: 'Unauthorized'}`. Filter
//    spreads onto the envelope: `detail` is filled from `obj.message`.
//    Live (2026-04-27 with bogus key): `{statusCode: 401, timestamp,
//    path, method, detail: "Invalid, expired, or IP-blocked API key",
//    message: same, error: "Unauthorized"}`.
//
// 3. `GET /mcp` 405 — controller calls `res.status(405).json({...})`
//    DIRECTLY (mcp-server.controller.ts:54-57), bypassing the global
//    HttpExceptionFilter. So the envelope is the bare controller body:
//    `{error: "Method Not Allowed", message: "...stateless mode..."}`.
//    No `statusCode` / `timestamp` / `path` / `method` keys.
//
// 4. HITL `NotFoundException('Challenge not found')` — wrapped by Nest
//    into the standard object form `{statusCode: 404, message: 'Challenge
//    not found', error: 'Not Found'}`. Filter spreads onto the envelope:
//    `detail` is filled from `obj.message`. Result: `{statusCode: 404,
//    timestamp, path, method, detail: "Challenge not found", message:
//    same, error: "Not Found"}`.
//
// Each schema below is `.strict()` and pinned against the live shape.
// All fields that are filter-supplied (`timestamp`, `path`, `method`)
// are kept REQUIRED (the filter ALWAYS adds them on any HttpException
// path); fields that vary by exception construction are `.optional()`.
//
// Phase 6 rubric is contract-shape only — no semantic assertion on the
// content of `error_description` or `message` text beyond non-empty.

/**
 * 401 envelope from `OAuthTokenGuard` — used by tests 26 (POST /mcp)
 * and 28 (DELETE /mcp). The OAuth-style `error` + `error_description`
 * are guard-supplied; `message` is absent (the obj passed to the
 * UnauthorizedException ctor doesn't include it). `detail` is the
 * filter's fallback string `'Request failed'`.
 */
export const McpAuthErrorOAuthSchema = z
  .object({
    statusCode: z.literal(401),
    timestamp: z.string(),
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    error: z.string(),
    error_description: z.string(),
    // The filter's optional dev-only `debugDetail` is NOT emitted on
    // pure auth failures (no `debugMsg` is passed to sendResponse for
    // the string-or-obj branches above), but be tolerant for forward-compat.
    debugDetail: z.string().optional(),
    // Forward-compat — `message` would appear if a future guard refactor
    // shifts to `UnauthorizedException('msg')` form.
    message: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict();

/**
 * 401 envelope from `ApiKeyAuthGuard` — used by test 29 (POST
 * /mcp/apikey with bogus Bearer). The guard throws
 * `UnauthorizedException('Invalid, expired, or IP-blocked API key')`
 * — a string ctor, so Nest wraps it in `{statusCode, message, error:
 * 'Unauthorized'}`. The filter then spreads onto the envelope; `detail`
 * mirrors `message`.
 */
export const McpAuthErrorApiKeySchema = z
  .object({
    statusCode: z.literal(401),
    timestamp: z.string(),
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    message: z.union([z.string(), z.array(z.string())]),
    error: z.string(),
    debugDetail: z.string().optional(),
  })
  .strict();

/**
 * 405 envelope from `GET /mcp` — controller writes
 * `res.status(405).json({error, message})` DIRECTLY, bypassing the
 * global filter. So the envelope is BARE — no statusCode / timestamp
 * / path / method keys. Strict — any drift trips the assertion.
 */
export const McpMethodNotAllowedSchema = z
  .object({
    error: z.literal('Method Not Allowed'),
    message: z.string(),
  })
  .strict();

/**
 * 404 envelope from HITL `NotFoundException('Challenge not found')` —
 * used by tests 30 (GET /mcp/hitl/:token) and 31 (POST /mcp/hitl/:token/
 * step-up). NestJS wraps the string ctor into
 * `{statusCode, message, error: 'Not Found'}`; filter spreads it.
 */
export const McpHitlNotFoundSchema = z
  .object({
    statusCode: z.literal(404),
    timestamp: z.string(),
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    message: z.union([z.string(), z.array(z.string())]),
    error: z.string(),
    debugDetail: z.string().optional(),
  })
  .strict();

/**
 * 400 envelope from HITL no-PIN branch — used by test 32 (gated on
 * `@requires:data-hitl-token`). The controller throws
 * `BadRequestException({code: 'no_pin', message: 'No PIN set...'})`
 * — an OBJECT ctor, so the filter spreads `code` + `message` onto the
 * envelope. NestJS does NOT auto-add `error: 'Bad Request'` for the
 * object-ctor form (only for string-ctor); `error` is `.optional()`.
 */
export const McpHitlNoPinSchema = z
  .object({
    statusCode: z.literal(400),
    timestamp: z.string(),
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    code: z.string(),
    message: z.union([z.string(), z.array(z.string())]),
    error: z.string().optional(),
    debugDetail: z.string().optional(),
  })
  .strict();
