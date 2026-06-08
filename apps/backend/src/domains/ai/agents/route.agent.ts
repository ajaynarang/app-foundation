import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class RouteAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'route',
    displayName: 'Route',
    mastraAgentId: 'sally-route',
    modelAlias: 'standard',
    domainSkills: ['route-expertise'],
    taskSkills: ['plan-new-route', 'reroute-active', 'investigate-delay', 'optimize-fuel-stops'],
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
        summary: `Monitoring ${inTransit} active routes`,
      };
    }
    return { state: 'idle' as const, summary: 'No active routes' };
  }
}
