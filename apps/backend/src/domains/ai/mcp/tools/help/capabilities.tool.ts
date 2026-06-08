import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

@Injectable()
export class CapabilitiesTool {
  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-capabilities',
    description:
      'Show what Sally can do for the current user. Use when user asks "what can you do?", "help", or "what are your capabilities?" Returns a structured capability list organized by category with example prompts.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies MCP Tool contract
  async getCapabilities() {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            message: "Here's what I can help you with. Click any example to try it!",
          }),
        },
      ],
      _card: { type: 'capabilities' as const, data: {} },
    };
  }
}
