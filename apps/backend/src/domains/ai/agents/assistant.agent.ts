import { Injectable } from '@nestjs/common';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

/**
 * The single generic assistant agent shipped by the starter.
 *
 * Add specialist agents by extending `AbstractBaseAgent` the same way and
 * registering them in `agents.module.ts` + `agent.registry.ts`.
 */
@Injectable()
export class AssistantAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'assistant',
    displayName: 'Assistant',
    mastraAgentId: 'assistant',
    modelAlias: 'standard',
    domainSkills: [],
    taskSkills: [],
    personas: ['owner', 'admin', 'member', 'super_admin'],
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
}
