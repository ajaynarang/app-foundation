import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Generic confirmation tool — used by the agent to request user approval
 * before executing write operations.
 *
 * When the agent wants to acknowledge/resolve an alert, plan a route, etc.,
 * it first calls this tool. The tool suspends the agent, sending the confirmation
 * request to the frontend. The user sees a confirmation card and clicks Confirm/Cancel.
 * On confirm, the controller resumes the agent, which then calls the actual write tool.
 *
 * This prevents the AI from executing write operations without explicit user consent.
 *
 * ## HITL bypass for Sally's Desk (spec §7.3)
 *
 * The Desk runtime handles approval at the EPISODE level (human approve/reject
 * before Act runs). Per-tool-call confirmation would double-prompt the user
 * for the same thing, so Desk-origin invocations must bypass this tool.
 *
 * Defense in depth, three layers:
 *   1. `McpToolService.getToolsForNames` injects `_invocationSource:'desk'`
 *      into every tool call made during a Desk beat.
 *   2. (THIS TOOL) If `_invocationSource === 'desk'`, short-circuit to
 *      confirmed=true without suspending. Prevents a Desk beat from hanging
 *      on a user prompt that nobody will ever see.
 *   3. Desk responsibilities' `tools` allowlist does not include
 *      `confirm-action` in the first place.
 */
export const confirmActionTool = createTool({
  id: 'confirm-action',
  description:
    'Request explicit user confirmation before executing a write operation. Call this BEFORE any write action. The user will see a confirmation card and must approve before the action proceeds.',
  inputSchema: z.object({
    action: z.string().describe('What action is being requested (e.g., "Acknowledge Alert")'),
    description: z.string().describe('Human-readable description of what will happen'),
    entityId: z.string().describe('ID of the entity being acted upon (e.g., alert ID)'),
    entityType: z.string().describe('Type of entity (e.g., "alert", "route")'),
    // Context field injected by McpToolService — marks Desk-origin calls so
    // the tool bypasses suspension (the episode-level approval is the only
    // HITL). Not surfaced to the model; it's set server-side per request.
    _invocationSource: z.enum(['chat', 'desk']).optional(),
  }),
  outputSchema: z.object({
    confirmed: z.boolean(),
    action: z.string(),
    entityId: z.string(),
    bypassed: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  suspendSchema: z.object({
    action: z.string(),
    description: z.string(),
    entityId: z.string(),
    entityType: z.string(),
  }),
  resumeSchema: z.object({
    confirmed: z.boolean(),
  }),
  execute: async ({ action, description, entityId, entityType, _invocationSource }, context) => {
    // Layer 2 of HITL bypass: Desk-origin calls short-circuit to confirmed
    // without asking the user. Episode-level approval already happened.
    if (_invocationSource === 'desk') {
      return {
        confirmed: true,
        action,
        entityId,
        bypassed: true,
        reason: 'desk-source-auto-confirm',
      };
    }

    const { resumeData, suspend } = context?.agent ?? {};

    // If resumed with confirmation, return result
    if (resumeData?.confirmed !== undefined) {
      return {
        confirmed: Boolean(resumeData.confirmed),
        action,
        entityId,
      };
    }

    // Not yet confirmed — suspend for user approval
    if (suspend) {
      await suspend({
        action,
        description,
        entityId,
        entityType,
      });
      // Execution pauses here — this return is unreachable but satisfies TypeScript
      return { confirmed: false, action, entityId };
    }

    // Fallback: if suspend is not available, deny by default.
    console.warn(
      `[confirm-action] suspend() not available for action "${action}" on ${entityType}:${entityId}. Denying by default.`,
    );
    return {
      confirmed: false,
      action,
      entityId,
    };
  },
});
