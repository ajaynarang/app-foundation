import { Injectable } from '@nestjs/common';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentDefinition } from './agent.types';
import { AbstractBaseAgent } from './base.agent';

@Injectable()
export class CustomerAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'customer',
    displayName: 'Customer',
    mastraAgentId: 'sally-customer',
    modelAlias: 'fast',
    domainSkills: ['product-knowledge'],
    taskSkills: ['track-my-shipment', 'get-my-documents', 'check-my-invoices'],
    personas: ['customer'],
    maxToolSteps: 5,
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
