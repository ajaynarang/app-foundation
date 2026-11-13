import { Module } from '@nestjs/common';
import { PROMPT_LIBRARY } from './prompt-registry.data';
import { PROMPT_LIBRARY_TOKEN, PromptRegistryService } from './prompt-registry.service';

/**
 * Serves the curated prompt library (`prompt-registry.data.ts`) to the external MCP server's `prompts/list` and
 * `prompts/get`. Static data, no controller.
 */
@Module({
  providers: [{ provide: PROMPT_LIBRARY_TOKEN, useValue: PROMPT_LIBRARY }, PromptRegistryService],
  exports: [PromptRegistryService],
})
export class PromptRegistryModule {}
