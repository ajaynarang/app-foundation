import { z } from 'zod';

/**
 * In-app approval of an external agent's write. An OAuth client or API key calling a write tool is answered with a
 * token and an `approvalUrl` (the web app's `/agent-actions/:token/approve`):
 *
 * - a standard write waits for a person to approve or deny it there (unless the workspace owner turned self-confirm
 *   on, see `AgentPolicy`);
 * - a sensitive write always needs the PIN of the person the agent acts for, entered on the same page.
 *
 * Once it is approved (or the PIN step is done) the agent repeats the call with the same arguments plus
 * `_confirmToken`, and it runs once.
 */
export const AGENT_ACTION_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'USED'] as const;
export const AgentActionStatusSchema = z.enum(AGENT_ACTION_STATUSES);
export type AgentActionStatus = z.infer<typeof AgentActionStatusSchema>;

export const AGENT_ACTION_DECISIONS = ['APPROVE', 'DENY'] as const;
export const AgentActionDecisionSchema = z.enum(AGENT_ACTION_DECISIONS);
export type AgentActionDecision = z.infer<typeof AgentActionDecisionSchema>;

/** The agent asking: an OAuth client (a connected app) or a personal API key. Its name, never its secret. */
export const AgentActionCallerSchema = z.object({
  kind: z.enum(['oauth_client', 'api_key']),
  label: z.string(),
});
export type AgentActionCaller = z.infer<typeof AgentActionCallerSchema>;

/** `GET /agent-actions/:token` and the body of every decision. */
export const AgentActionSchema = z.object({
  token: z.string(),
  tool: z.string(),
  /** `standard` (a person approves) or `sensitive` (the person acted for enters their PIN). */
  tier: z.enum(['standard', 'sensitive']),
  scopeRequired: z.string(),
  status: AgentActionStatusSchema,
  /** True for a sensitive write: approving means entering the PIN (`POST /mcp/hitl/:token/step-up`). */
  stepUpRequired: z.boolean(),
  /** True for a standard write a person approves with `POST /agent-actions/:token/approve`. */
  approvalRequired: z.boolean(),
  caller: AgentActionCallerSchema,
  /** The person the agent acts for (their email). */
  onBehalfOf: z.string().nullable(),
  /**
   * What the agent will run. An approval request shows the exact arguments; a PIN request shows them redacted
   * (`argsRedacted`). Empty once the request is spent or denied.
   */
  args: z.record(z.string(), z.unknown()),
  /** True when `args` hides values shaped like an email, phone number or national id. */
  argsRedacted: z.boolean(),
  expiresAt: z.string(),
  decidedAt: z.string().nullable(),
  decidedBy: z.string().nullable(),
  /** The viewer may deny, and approve an approval request (the person acted for, or a workspace owner or admin). */
  canDecide: z.boolean(),
  /** The viewer may enter the PIN: a pending PIN request, and the viewer is the person the agent acts for. */
  canStepUp: z.boolean(),
  /** Whether the viewer has a PIN set (the PIN itself is never returned). */
  hasPinSet: z.boolean(),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

/** `GET` / `PUT /agent-policy`: whether external agents wait for a person on a standard write. */
export const AgentPolicySchema = z.object({
  /**
   * False (default): a person approves each standard write in the app. True: agents confirm their own standard writes
   * by repeating the call with the token. A sensitive write always needs the person's PIN either way.
   */
  selfConfirm: z.boolean(),
});
export type AgentPolicy = z.infer<typeof AgentPolicySchema>;

export const UpdateAgentPolicyInputSchema = AgentPolicySchema;
export type UpdateAgentPolicyInput = z.infer<typeof UpdateAgentPolicyInputSchema>;
