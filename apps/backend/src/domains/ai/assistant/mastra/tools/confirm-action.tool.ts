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
 * There is no bypass. The tool takes no server-side switch (it used to accept an `_invocationSource` that, set to
 * `'desk'`, answered `confirmed: true` without asking anyone, and a model could send it). Desk never offers this
 * tool: a Desk write is gated by Desk's own gate step before the pipeline runs it.
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
  }),
  outputSchema: z.object({
    confirmed: z.boolean(),
    action: z.string(),
    entityId: z.string(),
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
  execute: async ({ action, description, entityId, entityType }, context) => {
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
