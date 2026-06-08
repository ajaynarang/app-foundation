import { Injectable } from '@nestjs/common';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class ProspectAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'prospect',
    displayName: 'Prospect',
    mastraAgentId: 'sally-prospect',
    modelAlias: 'fast',
    domainSkills: ['product-knowledge'],
    taskSkills: ['capture-lead', 'schedule-demo', 'answer-product-question'],
    personas: ['prospect'],
    maxToolSteps: 3,
  };

  constructor(
    skillLoader: PromptingService,
    mcpToolService: McpToolService,
    mastraProvider: MastraProvider,
    aiTelemetry: AiTelemetryService,
  ) {
    super(skillLoader, mcpToolService, mastraProvider, aiTelemetry);
  }
}
