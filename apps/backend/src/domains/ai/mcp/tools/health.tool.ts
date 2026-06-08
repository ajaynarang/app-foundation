import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

@Injectable()
export class HealthTool {
  @RequiresScope('platform:read')
  @Tool({
    name: 'health-check',
    description:
      'Verify that the AI assistant is reachable and operational. Use when a user asks "are you working?" or before diagnosing a connection issue. Returns status, timestamp, and version.',
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies MCP Tool contract
  async check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}
