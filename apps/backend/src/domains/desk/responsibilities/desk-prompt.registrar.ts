import { Injectable, OnModuleInit } from '@nestjs/common';

import { PromptingService } from '../../prompting/prompting.service';

import { AGENT_SYSTEM_PROMPTS } from './agent-system-prompts';
import { SUPPORT_FOLLOWUP_STEP_PROMPTS } from './support-followup/prompts';

/**
 * Registers Desk prompt fallbacks with PromptingService.
 *
 * At runtime PromptingService.getPrompt(name) tries LangFuse first (with 60s
 * cache), and falls back to whatever registerFallback() supplied. So these are
 * the "LangFuse offline or prompt not yet created there" defaults. Editing a
 * prompt in LangFuse takes precedence automatically.
 *
 * The starter registers the generic agent system prompt(s) and the reference
 * job's step prompts. When you add a responsibility, register its step prompts
 * (perceive/decide/draft) here the same way.
 */
@Injectable()
export class DeskPromptRegistrar implements OnModuleInit {
  constructor(private readonly prompting: PromptingService) {}

  onModuleInit(): void {
    // Generic agent system prompt(s).
    for (const [name, content] of Object.entries(AGENT_SYSTEM_PROMPTS)) {
      this.prompting.registerFallback(name, content);
    }
    // Step prompts, one map per responsibility.
    for (const [name, content] of Object.entries(SUPPORT_FOLLOWUP_STEP_PROMPTS)) {
      this.prompting.registerFallback(name, content);
    }
  }
}
