import { Injectable, Logger } from '@nestjs/common';

import { AgentId, UserMode } from '../agents/agent.types';
import { PromptingService } from '../../../domains/prompting';
import { SkillClassifierService } from './skill-classifier.service';

export interface RouteResult {
  agentId: AgentId;
  taskSkill: string | null;
  taskSkillContent: string | null;
  source: 'regex' | 'classifier' | 'default';
}

/**
 * Default agent per persona. The starter has a single generic agent, so every
 * persona maps to `assistant`. Add specialist agents and route to them here.
 */
const PERSONA_DEFAULT_AGENT: Record<string, AgentId> = {
  member: 'assistant',
  admin: 'assistant',
  owner: 'assistant',
  super_admin: 'assistant',
};

const DEFAULT_AGENT: AgentId = 'assistant';

/**
 * Personas that always go to their default agent (skip classification).
 *
 * The starter registers a single agent, so classifying would burn an LLM call
 * per chat turn only to answer 'assistant' every time. All starter personas
 * short-circuit here. When you add specialist agents, remove the personas
 * that should be routed by the classifier (step 3 below).
 */
const SINGLE_DOMAIN_PERSONAS: string[] = Object.keys(PERSONA_DEFAULT_AGENT);

@Injectable()
export class AssistantRouterService {
  private readonly logger = new Logger(AssistantRouterService.name);

  constructor(
    private readonly skillLoader: PromptingService,
    private readonly classifier: SkillClassifierService,
  ) {}

  /**
   * Resolve a userMode to the persona's default Mastra agent id (no
   * regex/classifier — pure mapping). Used by code paths that don't have
   * fresh user input to route on (e.g. resuming a tool-call flow after a
   * confirmation), so the resume targets the same agent the original
   * streaming turn would have defaulted to. The streaming path still uses
   * `route()` for its richer routing.
   */
  defaultAgentFor(userMode: string): AgentId {
    return PERSONA_DEFAULT_AGENT[userMode] ?? DEFAULT_AGENT;
  }

  async route(message: string, userMode: UserMode): Promise<RouteResult> {
    // Step 1: Regex match against task skill triggers
    const regexMatch = this.regexMatch(message);
    if (regexMatch) {
      const skillContent = await this.skillLoader.getSkill(regexMatch.skillId);
      this.logger.debug(`Regex match: ${regexMatch.skillId} → ${regexMatch.primaryAgent}`);
      return {
        agentId: regexMatch.primaryAgent,
        taskSkill: regexMatch.skillId,
        taskSkillContent: skillContent || null,
        source: 'regex',
      };
    }

    // Step 2: Single-domain personas → default agent, no classifier needed
    if (SINGLE_DOMAIN_PERSONAS.includes(userMode)) {
      const agentId = PERSONA_DEFAULT_AGENT[userMode] ?? DEFAULT_AGENT;
      return {
        agentId,
        taskSkill: null,
        taskSkillContent: null,
        source: 'default',
      };
    }

    // Step 3: Multi-domain personas → Haiku classifier
    const classification = await this.classifier.classify(message);
    let taskSkillContent: string | null = null;
    if (classification.taskSkill) {
      taskSkillContent = (await this.skillLoader.getSkill(classification.taskSkill)) || null;
    }
    this.logger.debug(`Classifier: ${classification.agentId} (task: ${classification.taskSkill})`);
    return {
      agentId: classification.agentId,
      taskSkill: classification.taskSkill,
      taskSkillContent,
      source: 'classifier',
    };
  }

  private regexMatch(message: string): { skillId: string; primaryAgent: AgentId } | null {
    const normalized = message.toLowerCase().trim();
    const taskSkills = this.skillLoader.getAllTaskSkills();

    for (const skill of taskSkills) {
      if (!skill.metadata.primaryAgent) continue;
      const triggers = skill.metadata.triggers ?? [];
      for (const trigger of triggers) {
        try {
          if (/[.*+?^${}()|[\]\\]/.test(trigger)) {
            const regex = new RegExp(trigger, 'i');
            if (regex.test(normalized)) {
              return {
                skillId: skill.metadata.name,
                primaryAgent: skill.metadata.primaryAgent as AgentId,
              };
            }
          } else if (normalized.includes(trigger.toLowerCase())) {
            return {
              skillId: skill.metadata.name,
              primaryAgent: skill.metadata.primaryAgent as AgentId,
            };
          }
        } catch {
          // Invalid regex in trigger — skip
        }
      }
    }
    return null;
  }
}
