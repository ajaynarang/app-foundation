import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { isAiConfigured, getRequiredAiEnvVar } from '../../infrastructure/providers/ai-provider';
import { StructuredOutputService } from '../../infrastructure/providers/structured-output.service';
import { PromptingService, PROMPT_NAMES } from '../../../../domains/prompting';
import { FUEL_RECEIPT_AGENT_INSTRUCTIONS } from '../../../../domains/prompting/prompts/fallbacks/fuel-receipt-parser.fallback';
import { FuelReceiptSchema, ALLOWED_MIME_TYPES, type FuelReceiptParseResult } from './fuel-receipt.schema';

@Injectable()
export class FuelReceiptParserService {
  private readonly logger = new Logger(FuelReceiptParserService.name);

  constructor(
    private readonly structuredOutputService: StructuredOutputService,
    private readonly promptService: PromptingService,
  ) {}

  private async getExtractionPrompt(): Promise<string> {
    return this.promptService.getPrompt(PROMPT_NAMES.FUEL_RECEIPT_PARSER);
  }

  async parse(imageBuffer: Buffer, mimeType: string): Promise<FuelReceiptParseResult> {
    if (!isAiConfigured()) {
      this.logger.error(`${getRequiredAiEnvVar()} is not configured`);
      throw new InternalServerErrorException(
        `AI service is not configured. Please set ${getRequiredAiEnvVar()} in environment variables.`,
      );
    }

    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}. Accepted: JPEG, PNG, WebP, HEIC, PDF.`);
    }

    this.logger.log(`Parsing fuel receipt (${imageBuffer.length} bytes, type: ${mimeType})`);

    const startTime = Date.now();
    const extractionPrompt = await this.getExtractionPrompt();

    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: extractionPrompt },
          {
            type: 'file' as const,
            data: imageBuffer,
            mediaType: mimeType as any,
          },
        ],
      },
    ];

    // Attempt 1: Fast model
    try {
      this.logger.log('Fuel receipt: attempting fast model');
      const result = await this.structuredOutputService.extract({
        messages,
        schema: FuelReceiptSchema,
        modelAlias: 'fast',
        systemPrompt: FUEL_RECEIPT_AGENT_INSTRUCTIONS,
        timeoutMs: 30_000,
      });

      if (result.object) {
        const parsed = FuelReceiptSchema.parse(result.object);
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Fuel receipt (fast) succeeded in ${durationMs}ms — vendor: ${parsed.vendorName}, state: ${parsed.state}`,
        );
        return {
          data: parsed,
          parsing: {
            model: 'fast',
            fallbackUsed: false,
            fallbackReason: null,
            durationMs,
          },
        };
      }

      this.logger.warn('Fuel receipt (fast) structuredOutput returned no object');
    } catch (error) {
      this.logger.warn(`Fuel receipt (fast) failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Attempt 2: Standard model
    try {
      this.logger.log('Fuel receipt: falling back to standard model');
      const result = await this.structuredOutputService.extract({
        messages,
        schema: FuelReceiptSchema,
        modelAlias: 'standard',
        systemPrompt: FUEL_RECEIPT_AGENT_INSTRUCTIONS,
        timeoutMs: 60_000,
      });

      if (result.object) {
        const parsed = FuelReceiptSchema.parse(result.object);
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Fuel receipt (standard) succeeded in ${durationMs}ms — vendor: ${parsed.vendorName}, state: ${parsed.state}`,
        );
        return {
          data: parsed,
          parsing: {
            model: 'standard',
            fallbackUsed: true,
            fallbackReason: 'fast_model_failed',
            durationMs,
          },
        };
      }

      throw new InternalServerErrorException('Document parsing failed — please try again or upload a clearer image');
    } catch (error) {
      this.logger.error(
        `Fuel receipt parsing failed on both models: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw this.classifyError(error);
    }
  }

  private classifyError(error: unknown): Error {
    const message = error instanceof Error ? error.message : JSON.stringify(error);

    if (message.includes('401') || message.includes('auth') || message.includes('API key')) {
      return new InternalServerErrorException(
        `AI service authentication failed. Please check your ${getRequiredAiEnvVar()}.`,
      );
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return new InternalServerErrorException('AI service rate limit exceeded. Please try again in a moment.');
    }
    return new BadRequestException(
      'Failed to extract data from fuel receipt. Please try again or enter fuel data manually.',
    );
  }
}
