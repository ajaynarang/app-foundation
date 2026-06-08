import { Injectable, OnModuleInit } from '@nestjs/common';

import { BASE_ASSISTANT, BASE_SUPPORT } from '../prompts/persona/base-prompts';
import { PromptingService } from '../prompting.service';
import { PROMPT_NAMES } from '../prompting.types';

/**
 * Chat persona fallbacks — LangFuse is always the primary source. These are the
 * code-level fallbacks registered at startup so the service has something to
 * return when LangFuse is offline or a key isn't in the project yet.
 *
 * The starter ships ONE generic assistant persona plus a generic support
 * persona. Register additional `PROMPT_NAMES.*` → persona-string pairs here as
 * you add role/domain-specific personas.
 */
@Injectable()
export class ChatPromptRegistrar implements OnModuleInit {
  constructor(private readonly promptService: PromptingService) {}

  onModuleInit() {
    this.promptService.registerFallback(PROMPT_NAMES.ASSISTANT, BASE_ASSISTANT);
    this.promptService.registerFallback(PROMPT_NAMES.SUPPORT, BASE_SUPPORT);
  }
}
