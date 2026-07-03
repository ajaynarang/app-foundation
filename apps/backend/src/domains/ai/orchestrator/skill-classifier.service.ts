import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';

import { ai } from '../infrastructure/providers/ai-provider';
import { AGENT_IDS, AgentId } from '../agents/agent.types';
import { PromptingService, PROMPT_NAMES } from '../../prompting';
import { getAiLangfuseTracer } from '@appshore/kernel/infrastructure/telemetry/telemetry';

interface ClassificationResult {
  agentId: AgentId;
  taskSkill: string | null;
}

@Injectable()
export class SkillClassifierService {
  private readonly logger = new Logger(SkillClassifierService.name);

  constructor(private readonly promptService: PromptingService) {}

  async classify(message: string): Promise<ClassificationResult> {
    try {
      const systemPrompt = await this.promptService.getPrompt(PROMPT_NAMES.SKILL_CLASSIFIER);
      // Internal routing micro-call — no entity to attribute a session to, so
      // we emit tracer-only telemetry (tagged) for Langfuse visibility rather
      // than fabricate a session id.
      const tracer = getAiLangfuseTracer();
      const result = await generateText({
        model: ai('fast'),
        system: systemPrompt,
        prompt: message,
        maxOutputTokens: 50,
        ...(tracer
          ? {
              experimental_telemetry: {
                isEnabled: true,
                functionId: 'skill-classifier',
                tracer,
                metadata: { tags: ['SKILL_CLASSIFIER'] },
              },
            }
          : {}),
      });
      // Strip markdown fences if LLM wraps JSON in ```json ... ```
      const jsonText = result.text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      const parsed = JSON.parse(jsonText);
      const agentId = (AGENT_IDS as readonly string[]).includes(parsed.agentId)
        ? (parsed.agentId as AgentId)
        : 'assistant';
      return { agentId, taskSkill: parsed.taskSkill ?? null };
    } catch (error) {
      this.logger.warn(`Classifier failed, defaulting to assistant: ${error}`);
      return { agentId: 'assistant', taskSkill: null };
    }
  }
}
