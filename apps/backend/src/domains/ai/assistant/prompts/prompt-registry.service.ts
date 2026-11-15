import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole } from '@appshore/db';
import type { AssistantPrompt } from '@app/shared-types';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { PROMPT_PLACEHOLDER } from './prompt-rules';

/** The prompt library the registry serves. Bound to `PROMPT_LIBRARY` in `PromptRegistryModule`. */
export const PROMPT_LIBRARY_TOKEN = Symbol('PROMPT_LIBRARY');

// External MCP clients keep the tool-steering sentence: only the <tools> tags are stripped.
const TOOLS_TAGS = /<\/?tools>/g;

/**
 * Serves the curated prompt library, filtered by the caller's role in the workspace, to the external MCP server
 * (`prompts/list` and `prompts/get`). Static data: no database, no I/O. The caller resolves the role; `null` (no
 * membership in the workspace) sees nothing.
 */
@Injectable()
export class PromptRegistryService {
  constructor(@Inject(PROMPT_LIBRARY_TOKEN) private readonly library: readonly AssistantPrompt[]) {}

  /** Prompts a caller with `role` may see. */
  listForRole(role: UserRole | null): AssistantPrompt[] {
    if (!role) return [];
    return this.library.filter((p) => p.roles.includes(role));
  }

  /**
   * One prompt, if `role` may see it. A prompt the role may not see answers exactly like one that does not exist, so
   * the list of prompts is not discoverable by name.
   */
  getForRole(name: string, role: UserRole | null): AssistantPrompt {
    const prompt = role ? this.library.find((p) => p.name === name && p.roles.includes(role)) : undefined;
    if (!prompt) throw new NotFoundException('That prompt is not available');
    return prompt;
  }

  /**
   * Fill a prompt's template. A blank optional value removes its placeholder (templates are written to read
   * correctly when a slot is empty). An argument the prompt does not declare, or a missing required one, is a 400
   * that names it.
   */
  render(name: string, role: UserRole | null, args: Record<string, string | undefined>): string {
    const prompt = this.getForRole(name, role);
    const declared = new Set(prompt.arguments.map((a) => a.name));
    for (const key of Object.keys(args)) {
      if (!declared.has(key)) {
        throw fieldError(`arguments.${key}`, `The prompt "${name}" has no argument named "${key}".`);
      }
    }
    for (const a of prompt.arguments) {
      if (a.required && !args[a.name]?.trim()) {
        throw fieldError(`arguments.${a.name}`, `The prompt "${name}" needs a value for "${a.name}".`);
      }
    }
    return prompt.template
      .replace(PROMPT_PLACEHOLDER, (_, key: string) => args[key]?.trim() ?? '')
      .replace(TOOLS_TAGS, '')
      .replace(/\s+([.,;:!?])/g, '$1') // the space an empty slot leaves before punctuation
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
