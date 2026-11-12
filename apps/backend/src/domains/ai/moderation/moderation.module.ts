import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ContentModerationService } from './content-moderation.service';
import { GuardrailsService } from './guardrails.service';
import { ModerationService } from './moderation.service';
import { AiRoutingModule } from '../routing/ai-routing.module';

/** The external moderation client, or null when `OPENAI_API_KEY` (zod `openaiApiKey`) is unset: moderation is off. */
export function openAiModerationClient(config: ConfigService): OpenAI | null {
  const apiKey = config.get<string>('openaiApiKey');
  return apiKey ? new OpenAI({ apiKey }) : null;
}

const OpenAIProvider = {
  provide: 'OPENAI_CLIENT',
  useFactory: openAiModerationClient,
  inject: [ConfigService],
};

const ContentModerationProvider = {
  provide: ContentModerationService,
  useFactory: (openai: OpenAI | null) => new ContentModerationService(openai),
  inject: ['OPENAI_CLIENT'],
};

@Module({
  imports: [AiRoutingModule],
  providers: [OpenAIProvider, ContentModerationProvider, GuardrailsService, ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
