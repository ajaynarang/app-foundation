import { Injectable, OnModuleInit } from '@nestjs/common';

import { PromptingService } from '../../../prompting/prompting.service';
import { PROMPT_NAMES } from '../../../prompting/prompting.types';

import { DESK_MEMORY_EXTRACT_PROMPT } from './prompts/memory-extract.prompt';

/**
 * Registers the default desk-memory extract prompt fallback with
 * PromptingService. Same LangFuse-first / code-fallback pattern as
 * DeskPromptRegistrar — LangFuse can override at any time without a
 * code change.
 *
 * Per-responsibility variants (e.g. desk.memory.extract.ar_followup.v1)
 * register their own fallbacks alongside the responsibility's other
 * step prompts.
 */
@Injectable()
export class DeskMemoryPromptRegistrar implements OnModuleInit {
  constructor(private readonly prompting: PromptingService) {}

  onModuleInit(): void {
    this.prompting.registerFallback(PROMPT_NAMES.DESK_MEMORY_EXTRACT, DESK_MEMORY_EXTRACT_PROMPT);
  }
}
