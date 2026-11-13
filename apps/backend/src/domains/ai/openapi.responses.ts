import { z } from 'zod';
import {
  AgentActionSchema,
  AgentActivityPageSchema,
  AgentPolicySchema,
  AiCredentialConnectResultSchema,
  AiSettingsSchema,
  AgentScopeSchema,
  BedrockBeginResponseSchema,
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

/** `GET /agent-actions/:token` and each decision: an external agent's write waiting for a person. */
export const AgentActionResponse = defineResponseSchema('AgentAction', AgentActionSchema);
/** `GET` / `PUT /agent-policy`: whether external agents wait for a person on a standard write. */
export const AgentPolicyResponse = defineResponseSchema('AgentPolicy', AgentPolicySchema);
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

// ─── AI settings (retention policy and workspace AI keys) ─────────────────────

/** `GET /ai-settings` and the policy flip: policy, `byokEnabled`, who pays per need, the credential cards. */
export const AiSettingsResponse = defineResponseSchema('AiSettings', AiSettingsSchema);
/** Connect and "Test again": the card and the live test's redacted result. */
export const AiCredentialConnectResultResponse = defineResponseSchema(
  'AiCredentialConnectResult',
  AiCredentialConnectResultSchema,
);
/** The Bedrock role flow's first step: the external id, the trust and permissions policies, the IaC snippets. */
export const BedrockBeginResponse = defineResponseSchema('BedrockBegin', BedrockBeginResponseSchema);
