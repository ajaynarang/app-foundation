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
import { apiErrorEnvelope, isoDateString, stringId } from './helpers.js';

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
 * The standard error envelope, as the AI routes answer it (the same shape every route answers).
 */
export const AiErrorEnvelopeSchema = apiErrorEnvelope();

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
 * 503 when voice is unavailable: the standard error envelope with code `UNAVAILABLE`.
 */
export const VoiceUnavailableErrorSchema = apiErrorEnvelope(503);

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
// Two shapes show up across the 7 tests:
//
// 1. Every thrown error (the `OAuthTokenGuard` 401, the `ApiKeyAuthGuard` 401, the HITL 404 and 400) leaves
//    as the standard error envelope: `statusCode, code, detail, fieldErrors?, timestamp, path, method,
//    debugDetail?`. No `message`, `error` or `error_description` key is on the wire.
//
// 2. `GET /mcp` 405 — the controller writes `res.status(405).json({...})` itself, as the MCP transport
//    expects, so that body is bare: `{error: "Method Not Allowed", message: "..."}`.

/**
 * 401 from `OAuthTokenGuard` on the MCP routes: the standard error envelope with code `UNAUTHENTICATED`.
 * The guard's `error_description` becomes `detail`; the RFC keys themselves are not on the wire.
 */
export const McpAuthErrorOAuthSchema = apiErrorEnvelope(401);

/**
 * 401 from `ApiKeyAuthGuard` (`POST /mcp/apikey` with a bad key): the standard error envelope.
 */
export const McpAuthErrorApiKeySchema = apiErrorEnvelope(401);

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
 * 404 from the HITL routes for an unknown challenge: the standard error envelope.
 */
export const McpHitlNotFoundSchema = apiErrorEnvelope(404);

/**
 * 400 from the HITL no-PIN branch: the standard error envelope carrying the route's own `code`.
 */
export const McpHitlNoPinSchema = apiErrorEnvelope(400);
