import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class ComplianceAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'compliance',
    displayName: 'Compliance',
    mastraAgentId: 'sally-compliance',
    modelAlias: 'standard',
    domainSkills: ['compliance-expertise'],
    taskSkills: ['audit-load-compliance', 'check-driver-quals', 'check-vehicle-docs', 'shield-investigation'],
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
    // Check drivers with expiring medical certs or CDLs
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoon = await this.prisma.driver.count({
      where: {
        tenantId,
        status: 'ACTIVE',
        OR: [
          { medicalCardExpiry: { gte: now, lt: thirtyDaysFromNow } },
          { cdlExpiry: { gte: now, lt: thirtyDaysFromNow } },
        ],
      },
    });
    if (expiringSoon > 0) {
      return {
        state: 'monitoring' as const,
        summary: `${expiringSoon} driver docs expiring soon`,
      };
    }
    return { state: 'idle' as const, summary: 'All compliant' };
  }
}
