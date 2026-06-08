import { Injectable, OnModuleInit } from '@nestjs/common';

import { PromptingService } from '../../prompting/prompting.service';
import { PROMPT_NAMES } from '../../prompting/prompting.types';

import { AR_FOLLOWUP_DECIDE_PROMPT } from './ar-followup/prompts/decide.prompt';
import { AR_FOLLOWUP_DRAFT_PROMPT } from './ar-followup/prompts/draft.prompt';
import { AR_FOLLOWUP_PERCEIVE_PROMPT } from './ar-followup/prompts/perceive.prompt';
import { CLOSEOUT_REVIEW_DECIDE_PROMPT } from './closeout-review/prompts/decide.prompt';
import { CLOSEOUT_REVIEW_DRAFT_PROMPT } from './closeout-review/prompts/draft.prompt';
import { CLOSEOUT_REVIEW_PERCEIVE_PROMPT } from './closeout-review/prompts/perceive.prompt';
import { DOCUMENT_EXPIRY_DECIDE_PROMPT } from './document-expiry/prompts/decide.prompt';
import { DOCUMENT_EXPIRY_DRAFT_PROMPT } from './document-expiry/prompts/draft.prompt';
import { DOCUMENT_EXPIRY_PERCEIVE_PROMPT } from './document-expiry/prompts/perceive.prompt';
import { SETTLEMENT_REVIEW_DECIDE_PROMPT } from './settlement-review/prompts/decide.prompt';
import { SETTLEMENT_REVIEW_PERCEIVE_PROMPT } from './settlement-review/prompts/perceive.prompt';
import { AGENT_SYSTEM_PROMPTS } from './agent-system-prompts';

/**
 * Registers Desk prompt fallbacks with PromptingService.
 *
 * At runtime PromptingService.getPrompt(name) tries LangFuse first (with
 * 60s cache), and falls back to whatever registerFallback() supplied. So
 * these are the "LangFuse offline or prompt not yet created there"
 * defaults. Editing a prompt in LangFuse takes precedence automatically.
 *
 * Two sets:
 *   - 12 agent system prompts (keys: desk.agent.<role>.v1) — short
 *     one-liner personas; real production copy lives in LangFuse
 *   - 3 AR Follow-up step prompts (keys: desk.ar_followup.{perceive,
 *     decide,draft}.v1) — full instruction sets, authored in code
 */
@Injectable()
export class DeskPromptRegistrar implements OnModuleInit {
  constructor(private readonly prompting: PromptingService) {}

  onModuleInit(): void {
    // AR Follow-up step prompts
    this.prompting.registerFallback(PROMPT_NAMES.DESK_AR_FOLLOWUP_PERCEIVE, AR_FOLLOWUP_PERCEIVE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_AR_FOLLOWUP_DECIDE, AR_FOLLOWUP_DECIDE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_AR_FOLLOWUP_DRAFT, AR_FOLLOWUP_DRAFT_PROMPT);

    // Closeout Review step prompts
    this.prompting.registerFallback(PROMPT_NAMES.DESK_CLOSEOUT_REVIEW_PERCEIVE, CLOSEOUT_REVIEW_PERCEIVE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_CLOSEOUT_REVIEW_DECIDE, CLOSEOUT_REVIEW_DECIDE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_CLOSEOUT_REVIEW_DRAFT, CLOSEOUT_REVIEW_DRAFT_PROMPT);

    // Document Expiry step prompts
    this.prompting.registerFallback(PROMPT_NAMES.DESK_DOCUMENT_EXPIRY_PERCEIVE, DOCUMENT_EXPIRY_PERCEIVE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_DOCUMENT_EXPIRY_DECIDE, DOCUMENT_EXPIRY_DECIDE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_DOCUMENT_EXPIRY_DRAFT, DOCUMENT_EXPIRY_DRAFT_PROMPT);

    // Settlement Review step prompts
    this.prompting.registerFallback(PROMPT_NAMES.DESK_SETTLEMENT_REVIEW_PERCEIVE, SETTLEMENT_REVIEW_PERCEIVE_PROMPT);
    this.prompting.registerFallback(PROMPT_NAMES.DESK_SETTLEMENT_REVIEW_DECIDE, SETTLEMENT_REVIEW_DECIDE_PROMPT);

    // 12 agent system prompts
    for (const [name, content] of Object.entries(AGENT_SYSTEM_PROMPTS)) {
      this.prompting.registerFallback(name, content);
    }
  }
}
