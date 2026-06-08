import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class PayrollAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'payroll',
    displayName: 'Payroll',
    mastraAgentId: 'sally-payroll',
    modelAlias: 'standard',
    domainSkills: ['settlement-expertise'],
    taskSkills: ['run-settlement-cycle', 'calculate-driver-pay', 'handle-pay-dispute'],
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
    const draftSettlements = await this.prisma.settlement.count({
      where: { tenantId, status: 'DRAFT' },
    });
    if (draftSettlements > 0) {
      return {
        state: 'monitoring' as const,
        summary: `${draftSettlements} settlements pending`,
      };
    }
    return { state: 'idle' as const, summary: 'All settled' };
  }
}
