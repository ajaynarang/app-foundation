import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';

import { AiRouteResolver } from '../routing/ai-route-resolver.service';
import { OUTPUT_CEILINGS } from '../routing/output-ceilings';
import { AGENT_IDS, AgentId } from '../agents/agent.types';
import { PromptingService, PROMPT_NAMES } from '../../prompting';
import { getAiLangfuseTracer } from '@appshore/kernel/infrastructure/telemetry/telemetry';

/** A one-line JSON verdict, plus room for the model's always-on thinking, which counts toward the cap. */
export const CLASSIFIER_MAX_OUTPUT_TOKENS = OUTPUT_CEILINGS.VERDICT;

interface ClassificationResult {
  agentId: AgentId;
  taskSkill: string | null;
}

@Injectable()
export class SkillClassifierService {
  private readonly logger = new Logger(SkillClassifierService.name);

  constructor(
    private readonly promptService: PromptingService,
    private readonly aiRouteResolver: AiRouteResolver,
  ) {}

  /**
   * The agent for `message`, decided on the tenant's own route. A routing refusal (no route, or a zero-retention
   * tenant with no compliant route) is caught like any other classifier failure: the message never leaves and the
   * turn goes to the default agent, whose own resolve then answers with the typed error.
   */
  async classify(message: string, tenantId: number): Promise<ClassificationResult> {
    try {
      const route = await this.aiRouteResolver.resolve(tenantId, 'language');
      const systemPrompt = await this.promptService.getPrompt(PROMPT_NAMES.SKILL_CLASSIFIER);
      // Internal routing micro-call — no entity to attribute a session to, so
      // we emit tracer-only telemetry (tagged) for Langfuse visibility rather
      // than fabricate a session id.
      const tracer = getAiLangfuseTracer();
      const result = await generateText({
        model: route.languageModel('fast'),
        system: systemPrompt,
        prompt: message,
        maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
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
      if (!result.text.trim()) {
        this.logger.warn(
          `Classifier returned an empty answer (finish: ${result.finishReason}); defaulting to assistant`,
        );
        return { agentId: 'assistant', taskSkill: null };
      }
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
