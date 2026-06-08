import { Injectable } from '@nestjs/common';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class MaintenanceAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'maintenance',
    displayName: 'Maintenance',
    mastraAgentId: 'sally-maintenance',
    modelAlias: 'standard',
    domainSkills: ['vehicle-maintenance', 'equipment-lifecycle'],
    taskSkills: [
      'schedule-pm-service',
      'handle-breakdown',
      'track-dot-inspection',
      'manage-tire-program',
      'reefer-monitoring',
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
    return { state: 'idle' as const, summary: 'Fleet maintenance on track' };
  }
}
