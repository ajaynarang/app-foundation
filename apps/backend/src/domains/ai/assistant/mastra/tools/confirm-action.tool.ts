import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/** The card the person sees, built from what the server recorded for it. */
export interface ConfirmCard {
  action: string;
  description: string;
  /** The write tool that runs on Confirm. */
  tool: string;
  /** Its exact arguments, as the tool will see them (parsed through its schema, `_` keys dropped). */
  args: Record<string, unknown>;
  /** The suspended confirm-action call: the key the resume route confirms or cancels. */
  toolCallId: string;
}

/**
 * Records the proposed write server-side and returns the card to show, or the reason it cannot be proposed (an
 * unknown tool, a read, a write the pipeline would refuse, arguments the tool would reject). Built per request by
 * `McpToolService`, which holds the session and the registry.
 */
export type ConfirmIntentRecorder = (input: {
  tool: string;
  args: Record<string, unknown>;
  toolCallId: string;
}) => Promise<{ ok: true; card: ConfirmCard } | { ok: false; error: string }>;

const inputSchema = z.object({
  tool: z.string().describe('The exact name of the write tool you will call after the person confirms.'),
  args: z
    .record(z.string(), z.unknown())
    .describe(
      'The exact arguments you will pass to that tool. The person approves these values; any change needs a new confirmation.',
    ),
  description: z
    .string()
    .optional()
    .describe(
      'Optional one-line summary for your own reasoning. The card the person sees is built from tool and args.',
    ),
});

/**
 * confirm-action: the in-app chat confirmation card.
 *
 * The model calls it BEFORE a write, naming the write tool and its exact arguments. The server records that intent
 * (`HitlChallengeService.recordChatIntent`) and the run suspends with a card built from the recorded tool and
 * arguments, never from model prose. Confirm on the card turns that one intent into a single-use grant, and the
 * pipeline runs only a write whose tool and arguments match it. Cancel, a new message, or the end of the resumed turn
 * voids it.
 *
 * There is no bypass: the tool takes no server-side switch (it used to accept an `_invocationSource` that, set to
 * `'desk'`, answered `confirmed: true` without asking anyone). Desk never offers this tool: a Desk write is gated by
 * Desk's own gate step before the pipeline runs it.
 */
export function createConfirmActionTool(recordIntent: ConfirmIntentRecorder) {
  return createTool({
    id: 'confirm-action',
    description:
      'Ask the person to confirm a change BEFORE calling any tool that creates, updates, sends or deletes something. ' +
      'Pass `tool` (the write tool you will call) and `args` (its exact arguments). The person sees a card with those ' +
      'values and must press Confirm. After confirmation, call that tool with the SAME arguments. One confirmation ' +
      'covers exactly one call.',
    inputSchema,
    outputSchema: z.object({
      confirmed: z.boolean(),
      tool: z.string(),
      reason: z.string().optional(),
    }),
    suspendSchema: z.object({
      action: z.string(),
      description: z.string(),
      tool: z.string(),
      args: z.record(z.string(), z.unknown()),
      toolCallId: z.string(),
    }),
    resumeSchema: z.object({
      confirmed: z.boolean(),
    }),
    execute: async ({ tool, args }, context) => {
      const agent = context?.agent;
      const resumeData = agent?.resumeData as { confirmed?: boolean } | undefined;

      // Resumed after the person decided. Whether the write may run is decided by the server-side grant; this only
      // tells the model what was chosen.
      if (resumeData?.confirmed !== undefined) {
        return { confirmed: Boolean(resumeData.confirmed), tool };
      }

      if (!agent?.suspend || !agent.toolCallId) {
        return { confirmed: false, tool, reason: 'Confirmation is not available here.' };
      }

      const recorded = await recordIntent({ tool, args: args ?? {}, toolCallId: agent.toolCallId });
      if ('error' in recorded) {
        return { confirmed: false, tool, reason: recorded.error };
      }

      await agent.suspend(recorded.card);
      // Execution pauses here; this return is not reached while suspended.
      return { confirmed: false, tool };
    },
  });
}

const MAX_DESCRIPTION = 400;

/** Card copy built from the recorded tool and arguments, never from model prose. */
export function describeIntent(
  toolName: string,
  data: Record<string, unknown>,
): { action: string; description: string } {
  const action = toolName
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
  const parts = Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${humanizeKey(key)}: ${typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}`);
  let description = parts.length ? `${action}: ${parts.join(', ')}` : action;
  if (description.length > MAX_DESCRIPTION) description = `${description.slice(0, MAX_DESCRIPTION - 1)}…`;
  return { action, description };
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}
