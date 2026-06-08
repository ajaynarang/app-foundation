import { Injectable } from '@nestjs/common';
import { AlertStatusSchema } from '@sally/shared-types';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

const ALERT_STATUS = AlertStatusSchema.enum;

@Injectable()
export class SafetyAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'safety',
    displayName: 'Safety',
    mastraAgentId: 'sally-safety',
    modelAlias: 'standard',
    domainSkills: ['safety-risk-management', 'accident-response', 'csa-monitoring'],
    taskSkills: [
      'handle-accident',
      'file-cargo-claim',
      'review-csa-score',
      'manage-insurance-claim',
      'post-accident-protocol',
    ],
    personas: ['dispatcher', 'admin', 'owner', 'super_admin', 'driver'],
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
    const openIncidents = await this.prisma.alert.count({
      where: { tenantId, status: ALERT_STATUS.ACTIVE },
    });
    if (openIncidents > 0) {
      return {
        state: 'monitoring' as const,
        summary: `${openIncidents} open incidents`,
      };
    }
    return { state: 'idle' as const, summary: 'No open incidents' };
  }
}
