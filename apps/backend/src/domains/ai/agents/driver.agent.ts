import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { PromptingService } from '../../../domains/prompting';
import { AgentContext, AgentDefinition, ChatChunk } from './agent.types';
import { AbstractBaseAgent } from './base.agent';
import { ToolNames } from '../agent-contract/tool-names.constants';

const EMERGENCY_PATTERNS = [
  /accident/i,
  /crash/i,
  /collision/i,
  /wreck/i,
  /hit\s/i,
  /injury/i,
  /fire/i,
  /hazmat.*spill/i,
  /rollover/i,
  /someone.*hurt/i,
  /ambulance/i,
  /police/i,
];

@Injectable()
export class DriverAgent extends AbstractBaseAgent {
  readonly definition: AgentDefinition = {
    id: 'driver',
    displayName: 'Driver',
    mastraAgentId: 'sally-driver',
    modelAlias: 'fast',
    domainSkills: ['driver-daily-ops'],
    taskSkills: [
      ToolNames.REPORT_ARRIVAL,
      ToolNames.REPORT_ISSUE,
      'check-my-hos',
      'find-fuel-stop',
      'emergency-escalation',
    ],
    personas: ['driver'],
    maxToolSteps: 6,
  };

  constructor(
    skillLoader: PromptingService,
    mcpToolService: McpToolService,
    mastraProvider: MastraProvider,
    aiTelemetry: AiTelemetryService,
    private readonly moduleRef: ModuleRef,
  ) {
    super(skillLoader, mcpToolService, mastraProvider, aiTelemetry);
  }

  async *chat(message: string, ctx: AgentContext): AsyncGenerator<ChatChunk> {
    const isEmergency = EMERGENCY_PATTERNS.some((p) => p.test(message));
    if (isEmergency) {
      this.logger.warn('Emergency detected from driver — escalating to safety agent');
      // Lazy-resolve AgentRegistry to avoid circular dependency at construction time
      const { AgentRegistry } = await import('./agent.registry');
      const registry = this.moduleRef.get(AgentRegistry, { strict: false });
      const safetyAgent = registry.get('safety');
      const taskSkillContent = await this.skillLoader.getSkill('handle-accident');
      yield* safetyAgent.chat(message, { ...ctx, taskSkillContent });
      return;
    }
    yield* super.chat(message, ctx);
  }
}
