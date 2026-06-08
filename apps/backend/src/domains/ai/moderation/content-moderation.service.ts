import { Injectable, Logger } from '@nestjs/common';
import type { ContentModerationCheckResult } from './types';

/**
 * OpenAI content moderation API wrapper.
 *
 * Note: `openai` constructor param is typed as `any` because the OpenAI SDK's
 * CategoryScores type doesn't have an index signature compatible with
 * Record<string, number>. The actual OpenAI instance is injected via DI factory.
 */
@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);

  constructor(private readonly openai: any) {}

  async check(text: string): Promise<ContentModerationCheckResult> {
    if (!this.openai) {
      this.logger.warn('OpenAI client not configured — skipping moderation');
      return { flagged: false, categories: [], scores: {} };
    }
    try {
      const response = await this.openai.moderations.create({
        model: 'omni-moderation-latest',
        input: text,
      });

      const result = response.results[0];

      const flaggedCategories = Object.entries(result.categories)
        .filter(([, flagged]: [string, any]) => flagged)
        .map(([name]: [string, any]) => name);

      return {
        flagged: result.flagged,
        categories: flaggedCategories,
        scores: result.category_scores,
      };
    } catch (error) {
      this.logger.error('OpenAI moderation API failed — failing open', error);
      return { flagged: false, categories: [], scores: {}, error: true };
    }
  }
}
