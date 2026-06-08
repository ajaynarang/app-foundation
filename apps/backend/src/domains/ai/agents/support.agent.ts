import { Injectable } from '@nestjs/common';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class SupportAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'support',
    displayName: 'Support',
    mastraAgentId: 'sally-support',
    modelAlias: 'standard',
    domainSkills: ['investigation-expertise'],
    taskSkills: ['diagnose-issue', 'create-ticket'],
    personas: ['support'],
    maxToolSteps: 8,
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
