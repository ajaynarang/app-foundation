import { z } from 'zod';
import {
  AgentActivityPageSchema,
  AgentScopeSchema,
  ConversationGreetingSchema,
  CreateConversationResponseSchema,
  GetMessagesResponseSchema,
  ListConversationsResponseSchema,
  MessageResponseSchema,
} from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';

/**
 * AI-domain response schemas for the published contract. Shared-types schemas are named as-is where the
 * wire matches them; the rest are described from the code that builds the body.
 */

// ─── External-agent activity and scopes ──────────────────────────────────────

/** `rows` + `nextCursor` (the createdAt ISO of the last row) — the activity feed's own page shape. */
export const AgentActivityPageResponse = defineResponseSchema('AgentActivityPage', AgentActivityPageSchema);

/** `DeveloperScopeEntry` (developer-scopes.controller). */
const DeveloperScopeEntrySchema = z.object({
  scope: AgentScopeSchema,
  summary: z.string(),
  grantsPlainEnglish: z.string(),
  hitlTier: z.enum(['none', 'standard', 'sensitive']),
  /** Live tools from the scope registry (max 4), falling back to the hand-authored samples. */
  sampleTools: z.array(z.string()),
});
export const DeveloperScopeEntryResponse = defineResponseSchema('DeveloperScopeEntry', DeveloperScopeEntrySchema);

// ─── Assistant conversations ───────────────────────────────────────────────────

/**
 * Stored message columns are nullable, and the history read passes them through as `null` — the wire is wider
 * than `MessageResponseSchema`'s optionals, so the published schema says so.
 */
const ConversationMessageSchema = MessageResponseSchema.extend({
  intent: z.string().nullable().optional(),
  card: z.record(z.string(), z.unknown()).nullable().optional(),
  action: z.record(z.string(), z.unknown()).nullable().optional(),
  speakText: z.string().nullable().optional(),
});

export const ConversationCreatedResponse = defineResponseSchema(
  'ConversationCreated',
  CreateConversationResponseSchema.extend({
    greeting: ConversationGreetingSchema.extend({ speakText: z.string().nullable().optional() }),
  }),
);
export const ConversationListResponse = defineResponseSchema('ConversationList', ListConversationsResponseSchema);
export const ConversationMessagesResponse = defineResponseSchema(
  'ConversationMessages',
  GetMessagesResponseSchema.extend({ messages: z.array(ConversationMessageSchema) }),
);

/** `AgentStatus` (agents/agent.types). */
const AssistantAgentStatusSchema = z.object({
  state: z.enum(['idle', 'working', 'monitoring', 'scheduled']),
  summary: z.string(),
  nextRun: z.string().optional(),
});
export const AssistantAgentStatusesResponse = defineResponseSchema(
  'AssistantAgentStatuses',
  z.object({
    agents: z.array(z.object({ id: z.string(), displayName: z.string(), status: AssistantAgentStatusSchema })),
  }),
);

// ─── MCP human-in-the-loop step-up ─────────────────────────────────────────────

export const HitlChallengeContextResponse = defineResponseSchema(
  'HitlChallengeContext',
  z.object({
    token: z.string(),
    tool: z.string(),
    tier: z.string(),
    scopeRequired: z.string(),
    /** Who is calling — the OAuth client or API key label. */
    callerLabel: z.string(),
    callerKind: z.string(),
    expiresAt: z.string(),
    requiresStepUp: z.boolean(),
    stepUpCompleted: z.boolean(),
    consumed: z.boolean(),
    expired: z.boolean(),
    /** Whether the viewer has a PIN set (the PIN itself is never returned). */
    hasPinSet: z.boolean(),
  }),
);
export const HitlStepUpResultResponse = defineResponseSchema(
  'HitlStepUpResult',
  z.object({ status: z.literal('step_up_verified') }),
);

// ─── Voice ─────────────────────────────────────────────────────────────────────

export const VoiceStatusResponse = defineResponseSchema('VoiceStatus', z.object({ available: z.boolean() }));
export const VoiceTokenResponse = defineResponseSchema(
  'VoiceToken',
  z.object({
    /** LiveKit room access token. */
    token: z.string(),
    /** LiveKit server URL. */
    url: z.string(),
  }),
);
