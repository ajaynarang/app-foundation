import { Injectable, OnModuleInit } from '@nestjs/common';

import { PromptingService } from '../../prompting/prompting.service';

import { AGENT_SYSTEM_PROMPTS } from './agent-system-prompts';

/**
 * Registers Desk prompt fallbacks with PromptingService.
 *
 * At runtime PromptingService.getPrompt(name) tries LangFuse first (with 60s
 * cache), and falls back to whatever registerFallback() supplied. So these are
 * the "LangFuse offline or prompt not yet created there" defaults. Editing a
 * prompt in LangFuse takes precedence automatically.
 *
 * The starter registers only the generic agent system prompt(s). When you add a
 * responsibility, register its step prompts (perceive/decide/draft) here, e.g.:
 *
 *   this.prompting.registerFallback('desk.welcome.perceive.v1', WELCOME_PERCEIVE_PROMPT);
 */
@Injectable()
export class DeskPromptRegistrar implements OnModuleInit {
  constructor(private readonly prompting: PromptingService) {}

  onModuleInit(): void {
    // Generic agent system prompt(s).
    for (const [name, content] of Object.entries(AGENT_SYSTEM_PROMPTS)) {
      this.prompting.registerFallback(name, content);
    }
  }
}
