// Mock transitive ESM dependencies that Jest can't parse
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    getPrompt: jest.fn(),
  })),
}));

// Mock the ai-provider module
jest.mock('../../../infrastructure/providers/ai-provider', () => ({
  isAiConfigured: jest.fn().mockReturnValue(true),
  getRequiredAiEnvVar: jest.fn().mockReturnValue('AI_GATEWAY_API_KEY'),
}));

import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { FuelReceiptParserService } from '../fuel-receipt-parser.service';
import { PROMPT_NAMES } from '../../../../../domains/prompting';
import { StructuredOutputService } from '../../../infrastructure/providers/structured-output.service';
import { PromptingService } from '../../../../../domains/prompting';
import { isAiConfigured, getRequiredAiEnvVar } from '../../../infrastructure/providers/ai-provider';

const sampleExtraction = {
  purchaseDate: '2026-03-15',
  gallons: 85.5,
  pricePerGallon: 3.459,
  totalAmount: 295.74,
  vendorName: 'Pilot Travel Centers',
  stationAddress: '1234 Highway 40',
  city: 'Nashville',
  state: 'TN',
  zipCode: '37201',
  fuelType: 'Diesel',
  taxAmount: 12.34,
  federalTax: 6.1,
  stateTax: 6.24,
};

describe('FuelReceiptParserService', () => {
  let service: FuelReceiptParserService;
  let mockStructuredOutputService: { extract: jest.Mock };
  let mockPromptService: any;

  const imageBuffer = Buffer.from('fake-image-data');
  const mimeType = 'image/jpeg';

  beforeEach(() => {
    mockStructuredOutputService = {
      extract: jest.fn(),
    };

    mockPromptService = {
      getPrompt: jest.fn().mockResolvedValue('Extract fuel receipt data.'),
      registerFallback: jest.fn(),
      isEnabled: false,
    };

    // Reset ai-provider mocks to defaults
    (isAiConfigured as jest.Mock).mockReturnValue(true);
    (getRequiredAiEnvVar as jest.Mock).mockReturnValue('AI_GATEWAY_API_KEY');

    service = new FuelReceiptParserService(
      mockStructuredOutputService as unknown as StructuredOutputService,
      mockPromptService as unknown as PromptingService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── parse() ──────────────────────────────────────────────────────────────
  // Note: fallback registration moved to ServiceFallbackRegistrar and is
  // covered by its own spec; no longer the consumer's responsibility.

  describe('parse()', () => {
    describe('when AI is not configured', () => {
      it('throws InternalServerErrorException', async () => {
        (isAiConfigured as jest.Mock).mockReturnValue(false);

        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow(InternalServerErrorException);
      });

      it('includes the required env var name in the error message', async () => {
        (isAiConfigured as jest.Mock).mockReturnValue(false);
        (getRequiredAiEnvVar as jest.Mock).mockReturnValue('AI_GATEWAY_API_KEY');

        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow('AI_GATEWAY_API_KEY');
      });
    });

    describe('when mime type is unsupported', () => {
      it('throws BadRequestException for text/plain', async () => {
        await expect(service.parse(imageBuffer, 'text/plain')).rejects.toThrow(BadRequestException);
      });

      it('includes the mime type in the error message', async () => {
        await expect(service.parse(imageBuffer, 'text/plain')).rejects.toThrow('text/plain');
      });

      it('allows supported image types (image/png)', async () => {
        mockStructuredOutputService.extract.mockResolvedValue({
          object: sampleExtraction,
        });

        await expect(service.parse(imageBuffer, 'image/png')).resolves.toBeDefined();
      });

      it('allows application/pdf', async () => {
        mockStructuredOutputService.extract.mockResolvedValue({
          object: sampleExtraction,
        });

        await expect(service.parse(imageBuffer, 'application/pdf')).resolves.toBeDefined();
      });
    });

    describe('fast model succeeds', () => {
      beforeEach(() => {
        mockStructuredOutputService.extract.mockResolvedValue({
          object: sampleExtraction,
        });
      });

      it('returns parsed data', async () => {
        const result = await service.parse(imageBuffer, mimeType);

        expect(result.data).toMatchObject({
          vendorName: 'Pilot Travel Centers',
          state: 'TN',
          gallons: 85.5,
          totalAmount: 295.74,
        });
      });

      it('returns fast model metadata', async () => {
        const result = await service.parse(imageBuffer, mimeType);

        expect(result.parsing.model).toBe('fast');
        expect(result.parsing.fallbackUsed).toBe(false);
        expect(result.parsing.fallbackReason).toBeNull();
        expect(result.parsing.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('calls extract only once for fast model', async () => {
        await service.parse(imageBuffer, mimeType);

        expect(mockStructuredOutputService.extract).toHaveBeenCalledTimes(1);
        expect(mockStructuredOutputService.extract).toHaveBeenCalledWith(
          expect.objectContaining({ modelAlias: 'fast' }),
        );
      });

      it('fetches extraction prompt before calling agent', async () => {
        await service.parse(imageBuffer, mimeType);

        expect(mockPromptService.getPrompt).toHaveBeenCalledWith(PROMPT_NAMES.FUEL_RECEIPT_PARSER);
      });
    });

    describe('fast model fails, standard model succeeds', () => {
      beforeEach(() => {
        mockStructuredOutputService.extract
          .mockRejectedValueOnce(new Error('Fast model timeout'))
          .mockResolvedValueOnce({ object: sampleExtraction });
      });

      it('returns parsed data from standard model', async () => {
        const result = await service.parse(imageBuffer, mimeType);

        expect(result.data).toMatchObject({
          vendorName: 'Pilot Travel Centers',
          state: 'TN',
        });
      });

      it('returns standard model metadata with fallback info', async () => {
        const result = await service.parse(imageBuffer, mimeType);

        expect(result.parsing.model).toBe('standard');
        expect(result.parsing.fallbackUsed).toBe(true);
        expect(result.parsing.fallbackReason).toBe('fast_model_failed');
      });

      it('calls extract twice (fast then standard)', async () => {
        await service.parse(imageBuffer, mimeType);

        expect(mockStructuredOutputService.extract).toHaveBeenCalledTimes(2);
      });
    });

    describe('fast model returns no object (null)', () => {
      it('falls back to standard model when fast returns null object', async () => {
        mockStructuredOutputService.extract
          .mockResolvedValueOnce({ object: null })
          .mockResolvedValueOnce({ object: sampleExtraction });

        const result = await service.parse(imageBuffer, mimeType);

        expect(result.parsing.model).toBe('standard');
        expect(result.parsing.fallbackUsed).toBe(true);
        expect(result.parsing.fallbackReason).toBe('fast_model_failed');
      });
    });

    describe('both models fail', () => {
      beforeEach(() => {
        mockStructuredOutputService.extract
          .mockRejectedValueOnce(new Error('Fast model error'))
          .mockRejectedValueOnce(new Error('Standard model error'));
      });

      it('throws a user-friendly BadRequestException', async () => {
        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow(BadRequestException);
      });

      it('suggests manual entry in the error message', async () => {
        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow('manually');
      });
    });

    describe('both models fail with auth error', () => {
      beforeEach(() => {
        mockStructuredOutputService.extract
          .mockRejectedValueOnce(new Error('401 Unauthorized'))
          .mockRejectedValueOnce(new Error('401 Unauthorized'));
      });

      it('throws InternalServerErrorException for auth errors', async () => {
        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow(InternalServerErrorException);
      });
    });

    describe('both models fail with rate limit error', () => {
      beforeEach(() => {
        mockStructuredOutputService.extract
          .mockRejectedValueOnce(new Error('429 rate limit exceeded'))
          .mockRejectedValueOnce(new Error('429 rate limit exceeded'));
      });

      it('throws InternalServerErrorException for rate limit errors', async () => {
        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow(InternalServerErrorException);
      });

      it('mentions rate limit in the error message', async () => {
        await expect(service.parse(imageBuffer, mimeType)).rejects.toThrow('rate limit');
      });
    });

    describe('partial extraction with null fields', () => {
      it('handles null fields in extraction result', async () => {
        const partialExtraction = {
          purchaseDate: '2026-03-15',
          gallons: 85.5,
          pricePerGallon: null,
          totalAmount: 295.74,
          vendorName: 'Pilot',
          stationAddress: null,
          city: null,
          state: 'TN',
          zipCode: null,
          fuelType: null,
          taxAmount: null,
          federalTax: null,
          stateTax: null,
        };

        mockStructuredOutputService.extract.mockResolvedValue({
          object: partialExtraction,
        });

        const result = await service.parse(imageBuffer, mimeType);

        expect(result.data.purchaseDate).toBe('2026-03-15');
        expect(result.data.gallons).toBe(85.5);
        expect(result.data.pricePerGallon).toBeNull();
        expect(result.data.state).toBe('TN');
        expect(result.data.stationAddress).toBeNull();
        expect(result.data.taxAmount).toBeNull();
        expect(result.data.federalTax).toBeNull();
        expect(result.data.stateTax).toBeNull();
      });
    });
  });
});
