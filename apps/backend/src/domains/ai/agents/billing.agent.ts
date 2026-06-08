import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class BillingAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'billing',
    displayName: 'Billing',
    mastraAgentId: 'sally-billing',
    modelAlias: 'standard',
    domainSkills: ['billing-expertise', 'customer-payment-patterns'],
    taskSkills: [
      'close-out-load',
      'generate-batch-invoices',
      'chase-aging-ar',
      'handle-billing-dispute',
      'submit-invoice-to-factor',
      'detect-detention-opportunity',
      'evaluate-rate-con',
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
    const readyToBill = await this.prisma.load.count({
      where: { tenantId, billingStatus: 'APPROVED' },
    });
    if (readyToBill > 0) {
      return {
        state: 'monitoring' as const,
        summary: `${readyToBill} invoices ready`,
      };
    }
    return { state: 'idle' as const, summary: 'All caught up' };
  }
}
