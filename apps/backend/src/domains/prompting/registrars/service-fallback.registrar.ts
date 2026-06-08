import { Injectable, OnModuleInit } from '@nestjs/common';

import {
  ALERT_BRIEFING_FALLBACK,
  CATCH_ME_UP_FALLBACK,
  CATEGORIZER_FALLBACK,
  FUEL_RECEIPT_EXTRACTION_FALLBACK,
  LOAD_BOARD_SEARCH_PARSER_FALLBACK,
  RATECON_EXTRACTION_FALLBACK,
  SHIELD_ANALYST_FALLBACK,
  SKILL_CLASSIFIER_FALLBACK,
} from '../prompts/fallbacks';
import { PromptingService } from '../prompting.service';
import { PROMPT_NAMES } from '../prompting.types';

/**
 * Registers code-level fallbacks for every non-chat, non-Desk LangFuse prompt.
 * LangFuse remains the source of truth at runtime; these strings are only
 * used when LangFuse is offline or a specific prompt hasn't been published.
 *
 * All fallback content lives in `domains/prompting/prompts/fallbacks/`,
 * never inside the consumer service. This is the single place that binds
 * a `PROMPT_NAMES` key to its code-level default.
 */
@Injectable()
export class ServiceFallbackRegistrar implements OnModuleInit {
  constructor(private readonly promptService: PromptingService) {}

  onModuleInit() {
    const entries: Array<[string, string]> = [
      [PROMPT_NAMES.RATECON_PARSER, RATECON_EXTRACTION_FALLBACK],
      [PROMPT_NAMES.FUEL_RECEIPT_PARSER, FUEL_RECEIPT_EXTRACTION_FALLBACK],
      [PROMPT_NAMES.SHIELD_ANALYST, SHIELD_ANALYST_FALLBACK],
      [PROMPT_NAMES.BRIEFING, CATCH_ME_UP_FALLBACK],
      [PROMPT_NAMES.ALERT_BRIEFING, ALERT_BRIEFING_FALLBACK],
      [PROMPT_NAMES.FEEDBACK_CATEGORIZER, CATEGORIZER_FALLBACK],
      [PROMPT_NAMES.SKILL_CLASSIFIER, SKILL_CLASSIFIER_FALLBACK],
      [PROMPT_NAMES.LOAD_BOARD_SEARCH_PARSER, LOAD_BOARD_SEARCH_PARSER_FALLBACK],
    ];
    for (const [name, content] of entries) {
      this.promptService.registerFallback(name, content);
    }
  }
}
