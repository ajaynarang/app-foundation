import { Injectable, OnModuleInit } from '@nestjs/common';

import { CATEGORIZER_FALLBACK, SKILL_CLASSIFIER_FALLBACK } from '../prompts/fallbacks';
import { PromptingService } from '../prompting.service';
import { PROMPT_NAMES } from '../prompting.types';

/**
 * Registers code-level fallbacks for every non-chat, non-Desk LangFuse prompt.
 * LangFuse remains the source of truth at runtime; these strings are only
 * used when LangFuse is offline or a specific prompt hasn't been published.
 *
 * All fallback content lives in `domains/prompting/prompts/fallbacks/`,
 * never inside the consumer service. This is the single place that binds
 * a `PROMPT_NAMES` key to its code-level default. The starter ships two
 * generic extraction/analysis prompts as examples — add your own here.
 */
@Injectable()
export class ServiceFallbackRegistrar implements OnModuleInit {
  constructor(private readonly promptService: PromptingService) {}

  onModuleInit() {
    const entries: Array<[string, string]> = [
      [PROMPT_NAMES.FEEDBACK_CATEGORIZER, CATEGORIZER_FALLBACK],
      [PROMPT_NAMES.SKILL_CLASSIFIER, SKILL_CLASSIFIER_FALLBACK],
    ];
    for (const [name, content] of entries) {
      this.promptService.registerFallback(name, content);
    }
  }
}
