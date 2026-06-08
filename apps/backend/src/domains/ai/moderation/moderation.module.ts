import { Module } from '@nestjs/common';
import OpenAI from 'openai';
import { ContentModerationService } from './content-moderation.service';
import { GuardrailsService } from './guardrails.service';
import { ModerationService } from './moderation.service';

const OpenAIProvider = {
  provide: 'OPENAI_CLIENT',
  useFactory: () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new OpenAI({ apiKey });
  },
};

const ContentModerationProvider = {
  provide: ContentModerationService,
  useFactory: (openai: OpenAI | null) => new ContentModerationService(openai),
  inject: ['OPENAI_CLIENT'],
};

@Module({
  providers: [OpenAIProvider, ContentModerationProvider, GuardrailsService, ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
