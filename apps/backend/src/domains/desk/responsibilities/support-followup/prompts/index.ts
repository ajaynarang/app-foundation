import { SUPPORT_FOLLOWUP_DECIDE_PROMPT } from './decide.prompt';
import { SUPPORT_FOLLOWUP_DRAFT_PROMPT } from './draft.prompt';
import { SUPPORT_FOLLOWUP_PERCEIVE_PROMPT } from './perceive.prompt';

/**
 * Prompt names follow `desk.<responsibility_key>.<step_kind>.v<n>`. They live here, inside the Desk folder, so a
 * product scaffolded without Desk loses them with it.
 */
export const SUPPORT_FOLLOWUP_PROMPT_KEYS = {
  PERCEIVE: 'desk.support_followup.perceive.v1',
  DECIDE: 'desk.support_followup.decide.v1',
  DRAFT: 'desk.support_followup.draft.v1',
} as const;

/** Name → text, for the in-memory fallback (`desk-prompt.registrar.ts`) and the Langfuse seed script. */
export const SUPPORT_FOLLOWUP_STEP_PROMPTS: Record<string, string> = {
  [SUPPORT_FOLLOWUP_PROMPT_KEYS.PERCEIVE]: SUPPORT_FOLLOWUP_PERCEIVE_PROMPT,
  [SUPPORT_FOLLOWUP_PROMPT_KEYS.DECIDE]: SUPPORT_FOLLOWUP_DECIDE_PROMPT,
  [SUPPORT_FOLLOWUP_PROMPT_KEYS.DRAFT]: SUPPORT_FOLLOWUP_DRAFT_PROMPT,
};
