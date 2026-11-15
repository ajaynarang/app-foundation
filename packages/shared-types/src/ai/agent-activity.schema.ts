import { z } from 'zod';
import { cursorListSchema } from '../infrastructure/cursor-list';
import { AgentScopeSchema } from './agent-scopes.schema';

/**
 * Who performed an agent invocation. Mirrors AgentInvocationLog.principalKind.
 */
export const AgentPrincipalKindSchema = z.enum(['user', 'desk_responsibility', 'oauth_client', 'api_key']);
export type AgentPrincipalKind = z.infer<typeof AgentPrincipalKindSchema>;

/**
 * Projection of AgentInvocationLog safe to send to frontend clients.
 * Never includes argsRaw or piiReadFlag — those stay server-side.
 */
export const AgentActivityRowSchema = z.object({
  id: z.string().uuid(),
  principalKind: AgentPrincipalKindSchema,
  principalId: z.string(),
  principalLabel: z.string(),
  toolName: z.string(),
  scopeRequired: AgentScopeSchema,
  hitlTier: z.enum(['none', 'standard', 'sensitive']),
  argsDigest: z.string(),
  argsRedacted: z.record(z.string(), z.unknown()),
  success: z.boolean(),
  durationMs: z.number().int().nullable(),
  error: z.string().nullable(),
  outputSummary: z.string().nullable(),
  confirmationTokenId: z.string().nullable(),
  langfuseTraceId: z.string().nullable(),
  createdAt: z.string(), // ISO timestamp
});
export type AgentActivityRow = z.infer<typeof AgentActivityRowSchema>;

/** Activity list filter shown as segmented control chips. */
export const AgentActivityFilterSchema = z.enum(['all', 'tool_calls', 'approvals']);
export type AgentActivityFilter = z.infer<typeof AgentActivityFilterSchema>;

/** `GET /agent-activity`: a cursor list, newest first. `nextCursor` is opaque. */
export const AgentActivityPageSchema = cursorListSchema(AgentActivityRowSchema);
export type AgentActivityPage = z.infer<typeof AgentActivityPageSchema>;
