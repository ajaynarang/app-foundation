import { Injectable } from '@nestjs/common';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class FuelAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'fuel',
    displayName: 'Fuel',
    mastraAgentId: 'sally-fuel',
    modelAlias: 'standard',
    domainSkills: ['fuel-cost-management', 'ifta-reporting'],
    taskSkills: [
      'reconcile-fuel-cards',
      'file-ifta-report',
      'analyze-cost-per-mile',
      'flag-fuel-anomaly',
      'optimize-fuel-purchasing',
    ],
    personas: ['dispatcher', 'admin', 'owner', 'super_admin'],
    maxToolSteps: 10,
  };

  constructor(
    skillLoader: PromptingService,
    mcpToolService: McpToolService,
    mastraProvider: MastraProvider,
    aiTelemetry: AiTelemetryService,
  ) {
    super(skillLoader, mcpToolService, mastraProvider, aiTelemetry);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- overrides async contract
  async getStatus(_tenantId: number) {
    return { state: 'idle' as const, summary: 'Fuel tracking active' };
  }
}
