import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class DispatchAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'dispatch',
    displayName: 'Dispatch',
    mastraAgentId: 'sally-dispatch',
    modelAlias: 'standard',
    domainSkills: ['load-lifecycle', 'fleet-expertise'],
    taskSkills: [
      'assign-load-to-driver',
      'investigate-late-delivery',
      'handle-tonu',
      'batch-status-update',
      'onboard-driver',
    ],
    personas: ['dispatcher', 'admin', 'owner', 'super_admin'],
    maxToolSteps: 10,
  };

  constructor(
    skillLoader: PromptingService,
    mcpToolService: McpToolService,
    mastraProvider: MastraProvider,
    aiTelemetry: AiTelemetryService,
    private readonly prisma: PrismaService,
  ) {
    super(skillLoader, mcpToolService, mastraProvider, aiTelemetry);
  }

  async getStatus(tenantId: number) {
    const inTransit = await this.prisma.load.count({
      where: { tenantId, status: 'IN_TRANSIT' },
    });
    if (inTransit > 0) {
      return {
        state: 'monitoring' as const,
        summary: `${inTransit} loads in motion`,
      };
    }
    return { state: 'idle' as const, summary: 'All loads stationary' };
  }
}
