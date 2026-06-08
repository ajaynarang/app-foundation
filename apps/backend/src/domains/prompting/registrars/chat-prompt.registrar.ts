import { Injectable, OnModuleInit } from '@nestjs/common';

import {
  BASE_BILLING,
  BASE_COMPLIANCE,
  BASE_CUSTOMER,
  BASE_DISPATCH,
  BASE_DRIVER,
  BASE_FUEL,
  BASE_MAINTENANCE,
  BASE_PAYROLL,
  BASE_PROSPECT,
  BASE_ROUTE,
  BASE_SAFETY,
  BASE_SUPPORT,
} from '../prompts/persona/base-prompts';
import { PromptingService } from '../prompting.service';
import { PROMPT_NAMES } from '../prompting.types';

/**
 * Chat persona fallbacks — LangFuse is always the primary source. These are the
 * code-level fallbacks registered at startup so the service has something to
 * return when LangFuse is offline or a key isn't in the project yet.
 */
@Injectable()
export class ChatPromptRegistrar implements OnModuleInit {
  constructor(private readonly promptService: PromptingService) {}

  onModuleInit() {
    // Chat personas
    this.promptService.registerFallback(PROMPT_NAMES.DISPATCHER, BASE_DISPATCH);
    this.promptService.registerFallback(PROMPT_NAMES.OWNER, BASE_DISPATCH);
    this.promptService.registerFallback(PROMPT_NAMES.ADMIN, BASE_DISPATCH);
    this.promptService.registerFallback(PROMPT_NAMES.SUPER_ADMIN, BASE_DISPATCH);
    this.promptService.registerFallback(PROMPT_NAMES.DRIVER, BASE_DRIVER);
    this.promptService.registerFallback(PROMPT_NAMES.CUSTOMER, BASE_CUSTOMER);
    this.promptService.registerFallback(PROMPT_NAMES.SUPPORT, BASE_SUPPORT);
    this.promptService.registerFallback(PROMPT_NAMES.PROSPECT, BASE_PROSPECT);

    // Domain agent personas reuse base prompts for chat mode
    this.promptService.registerFallback(PROMPT_NAMES.BILLING, BASE_BILLING);
    this.promptService.registerFallback(PROMPT_NAMES.COMPLIANCE, BASE_COMPLIANCE);
    this.promptService.registerFallback(PROMPT_NAMES.SAFETY, BASE_SAFETY);
    this.promptService.registerFallback(PROMPT_NAMES.ROUTE, BASE_ROUTE);
    this.promptService.registerFallback(PROMPT_NAMES.PAYROLL, BASE_PAYROLL);
    this.promptService.registerFallback(PROMPT_NAMES.MAINTENANCE, BASE_MAINTENANCE);
    this.promptService.registerFallback(PROMPT_NAMES.FUEL, BASE_FUEL);
  }
}
