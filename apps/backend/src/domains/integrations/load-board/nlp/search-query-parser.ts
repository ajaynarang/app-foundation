import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { StructuredOutputService } from '../../../ai/infrastructure/providers/structured-output.service';
import { PromptingService, PROMPT_NAMES } from '../../../../domains/prompting';

const SearchExtractionSchema = z.object({
  originCity: z.string().nullable(),
  originState: z.string().length(2).nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().length(2).nullable(),
  equipmentTypes: z.array(z.string()).nullable(),
  minRatePerMile: z.number().nullable(),
  maxDeadheadMiles: z.number().nullable(),
  minWeight: z.number().nullable(),
  maxWeight: z.number().nullable(),
});

export type SearchExtraction = z.infer<typeof SearchExtractionSchema>;

@Injectable()
export class SearchQueryParser {
  private readonly logger = new Logger(SearchQueryParser.name);

  constructor(
    private readonly structuredOutputService: StructuredOutputService,
    private readonly promptService: PromptingService,
  ) {}

  async parse(query: string): Promise<SearchExtraction | null> {
    try {
      const systemPrompt = await this.promptService.getPrompt(PROMPT_NAMES.LOAD_BOARD_SEARCH_PARSER);
      const result = await this.structuredOutputService.extract<SearchExtraction>({
        messages: [{ role: 'user', content: query }],
        schema: SearchExtractionSchema,
        modelAlias: 'fast',
        systemPrompt,
        timeoutMs: 5_000,
      });

      if (!result.object) return null;

      const parsed = SearchExtractionSchema.parse(result.object);

      // Must have at least an origin city to be useful
      if (!parsed.originCity) return null;

      return parsed;
    } catch (error: any) {
      this.logger.warn(`NLP parse failed: ${error.message}`);
      return null;
    }
  }
}
