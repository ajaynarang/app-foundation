import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Delegate tool for inter-agent communication.
 * Called by the primary agent to ask another domain agent for READ-ONLY work.
 *
 * CRITICAL: Sub-agents called via delegate only get READ tools.
 * All write operations (invoicing, status updates, etc.) must be done
 * by the primary agent directly — never via delegation.
 *
 * The execute function is a placeholder — it is replaced at runtime
 * by AgentRegistry with actual delegation logic.
 */
export const delegateToAgentTool = createTool({
  id: 'delegate-to-agent',
  description:
    'Call another Sally specialist agent for domain-specific READ operations. ' +
    'Use this for compliance checks, pay calculations, status queries — NOT for write operations. ' +
    'Available agents: dispatch, billing, compliance, safety, route, payroll, maintenance, fuel.',
  inputSchema: z.object({
    agentId: z
      .enum(['dispatch', 'billing', 'compliance', 'safety', 'route', 'payroll', 'maintenance', 'fuel'] as const)
      .describe('Which specialist agent to call'),
    action: z.string().describe('What to do, e.g. "check document compliance for load 4521"'),
    params: z.record(z.unknown()).describe('Parameters like { loadId: "4521" }'),
  }),
  outputSchema: z.object({
    text: z.string(),
    structured: z.record(z.unknown()).optional(),
  }),
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies Mastra createTool execute contract
  execute: async ({ agentId, action, params: _params }) => {
    // The actual execution is wired in agent.registry.ts at runtime
    // because we need access to the NestJS DI container.
    throw new Error(
      `delegate-to-agent execute must be wired at runtime via AgentRegistry (called with agentId=${agentId}, action=${action})`,
    );
  },
});
