import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

// Mock ESM modules before imports
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({ getPrompt: jest.fn() })),
}));
jest.mock('langfuse-core', () => ({}));

process.env.ANTHROPIC_API_KEY = 'test-key';

jest.mock('../../../infrastructure/providers/ai-provider', () => ({
  isAiConfigured: jest.fn().mockReturnValue(true),
  getRequiredAiEnvVar: jest.fn().mockReturnValue('ANTHROPIC_API_KEY'),
  ai: jest.fn(() => 'mock-model'),
  aiDirect: jest.fn(() => 'mock-model-direct'),
}));

jest.mock('../../../sally-ai/mastra/mastra.provider', () => ({}));

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({
      text: 'Load #12345 Rate: $1500.00 Pickup: Dallas TX Delivery: Houston TX some more text to exceed min length threshold for rate confirmation document extraction',
      numpages: 1,
    }),
  })),
}));

// Mock the schema module to avoid deep Zod parsing issues
jest.mock('../ratecon.schema', () => ({
  RateconExtractionSchema: {
    parse: jest.fn((obj: any) => obj),
  },
  RateconSchema: {},
  computeConfidence: jest.fn(() => 0.85),
}));

import { RateconParserService } from '../ratecon-parser.service';
import { StructuredOutputService } from '../../../infrastructure/providers/structured-output.service';
import { PromptingService } from '../../../../../domains/prompting';

const mockStructuredOutput = {
  extract: jest.fn(),
};

const mockPromptService = {
  registerFallback: jest.fn(),
  getPrompt: jest.fn().mockResolvedValue('Extract data from ratecon'),
};

describe('RateconParserService', () => {
  let service: RateconParserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateconParserService,
        { provide: StructuredOutputService, useValue: mockStructuredOutput },
        { provide: PromptingService, useValue: mockPromptService },
      ],
    }).compile();
    service = module.get<RateconParserService>(RateconParserService);
  });

  describe('parse - text-first strategy', () => {
    it('should extract data from PDF text', async () => {
      const extraction = {
        load_number: '12345',
        rate_total_usd: 1500,
        broker_name: 'Test Broker',
        stops: [
          { type: 'pickup', city: 'Dallas', state: 'TX' },
          { type: 'delivery', city: 'Houston', state: 'TX' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('fake-pdf'), 'test-ratecon.pdf', 'text-first');

      expect(result.data.load_number).toBe('12345');
      expect(result.parsing.actualStrategy).toBe('text-first');
      expect(result.parsing.fallbackUsed).toBe(false);
    });

    it('should throw if AI not configured', async () => {
      const { isAiConfigured } = await import('../../../infrastructure/providers/ai-provider');
      (isAiConfigured as jest.Mock).mockReturnValueOnce(false);

      await expect(service.parse(Buffer.from('pdf'), 'test.pdf')).rejects.toThrow(InternalServerErrorException);
    });

    it('should auto-escalate to vision when extracted text is too short (scanned PDF)', async () => {
      const { PDFParse } = await import('pdf-parse');
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({ text: 'short', numpages: 2 }),
      }));
      const extraction = {
        load_number: 'SCAN-001',
        rate_total_usd: 1200,
        broker_name: 'Scanned Broker',
        stops: [
          { type: 'pickup', city: 'Brooklyn', state: 'NY' },
          { type: 'delivery', city: 'Boston', state: 'MA' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('pdf'), 'scanned.pdf', 'text-first');

      expect(result.data.load_number).toBe('SCAN-001');
      expect(result.parsing.requestedStrategy).toBe('text-first');
      expect(result.parsing.actualStrategy).toBe('vision');
      expect(result.parsing.fallbackUsed).toBe(true);
      expect(result.parsing.fallbackReason).toBe('text_extraction_too_short');
      expect(result.parsing.textExtractionChars).toBe('short'.length);
    });

    it('should auto-escalate to vision when the text layer scrambles the load-number label', async () => {
      // Real SQ-119 signature: load value bare at the top, "PRO #" label
      // stranded at the footer with no adjacent digits. The text has plenty of
      // words (not scanned) so only the scramble guard can catch it.
      const scrambledText = [
        '62988',
        'VALUE INDUSTRY 252 DOREMUS AVE 1581811',
        '4130912 NEWARK NJ 07105',
        'LINE HAUL RATE 1150.00 TOTAL RATE 1150.00',
        'PICK 1 DAYTON NJ STOP 1 ANDOVER MA',
        'PRO # Rate Confirmation',
        'MC # DOT Driver',
        'Send Carrier Bills to the Address Above PRO # must appear on all Invoices',
      ].join('\n');
      const { PDFParse } = await import('pdf-parse');
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({ text: scrambledText, numpages: 1 }),
      }));
      // Vision (operating on the real layout) returns the correct PRO# as the load.
      const extraction = {
        load_number: '62988',
        rate_total_usd: 1150,
        broker_name: 'Value Industry',
        stops: [
          { type: 'pickup', city: 'Dayton', state: 'NJ' },
          { type: 'delivery', city: 'Andover', state: 'MA' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('pdf'), 'value-industry.pdf', 'text-first');

      expect(result.data.load_number).toBe('62988'); // the PRO#, not the MC# (1581811)
      expect(result.parsing.requestedStrategy).toBe('text-first');
      expect(result.parsing.actualStrategy).toBe('vision');
      expect(result.parsing.fallbackUsed).toBe(true);
      expect(result.parsing.fallbackReason).toBe('scrambled_layout');
      expect(result.parsing.textExtractionChars).toBe(scrambledText.length);
    });

    it('should fail gracefully when primary model returns no object and fallback disabled', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'false';
      mockStructuredOutput.extract.mockResolvedValue({ object: null });

      await expect(service.parse(Buffer.from('pdf'), 'test.pdf', 'text-first')).rejects.toThrow(BadRequestException);

      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should use fallback model when primary fails and fallback enabled', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      const extraction = {
        load_number: '99999',
        rate_total_usd: 2000,
        broker_name: 'Fallback Broker',
        stops: [
          { type: 'pickup', city: 'LA', state: 'CA' },
          { type: 'delivery', city: 'SF', state: 'CA' },
        ],
      };
      // Primary fails, fallback succeeds
      mockStructuredOutput.extract
        .mockResolvedValueOnce({ object: null })
        .mockResolvedValueOnce({ object: extraction });

      const result = await service.parse(Buffer.from('fake-pdf'), 'test-ratecon.pdf', 'text-first');

      expect(result.data.load_number).toBe('99999');
      expect(result.parsing.fallbackUsed).toBe(true);
      expect(result.parsing.fallbackReason).toBe('standard_model_failed');
      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should throw when both primary and fallback fail', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      mockStructuredOutput.extract.mockResolvedValueOnce({ object: null }).mockResolvedValueOnce({ object: null });

      await expect(service.parse(Buffer.from('fake-pdf'), 'test.pdf', 'text-first')).rejects.toThrow();

      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should handle primary model exception and try fallback', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      const extraction = {
        load_number: '12345',
        rate_total_usd: 1500,
        broker_name: 'Test Broker',
        stops: [{ type: 'pickup', city: 'Dallas', state: 'TX' }],
      };
      mockStructuredOutput.extract
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ object: extraction });

      const result = await service.parse(Buffer.from('fake-pdf'), 'test-ratecon.pdf', 'text-first');

      expect(result.data.load_number).toBe('12345');
      expect(result.parsing.fallbackUsed).toBe(true);
      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should reject (not escalate) when PDF is empty/corrupt — 0 pages', async () => {
      const { PDFParse } = await import('pdf-parse');
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockRejectedValue(new Error('Corrupt PDF')),
      }));
      // No vision call should be made — assert by checking extract was never called.
      mockStructuredOutput.extract.mockClear();

      await expect(service.parse(Buffer.from('pdf'), 'corrupt.pdf', 'text-first')).rejects.toThrow(BadRequestException);
      expect(mockStructuredOutput.extract).not.toHaveBeenCalled();
    });

    it('should reject when pdf-parse returns text but numpages=0 (structurally broken)', async () => {
      const { PDFParse } = await import('pdf-parse');
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({ text: '', numpages: 0 }),
      }));
      mockStructuredOutput.extract.mockClear();

      await expect(service.parse(Buffer.from('pdf'), 'empty.pdf', 'text-first')).rejects.toThrow(BadRequestException);
      expect(mockStructuredOutput.extract).not.toHaveBeenCalled();
    });

    // SQ-107 — pdf-parse can return non-trivial total chars made entirely of
    // page-marker boilerplate ("-- 1 of 6 --\n\n-- 2 of 6 --\n\n..."), which
    // a char-count gate happily passes. The model then receives zero real
    // content and hallucinates "<UNKNOWN>" placeholders. Detector must look
    // at per-page text, not the combined blob.
    it('should escalate scanned PDF to vision even when total text length exceeds char threshold (SQ-107)', async () => {
      const { PDFParse } = await import('pdf-parse');
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({
          // 96 chars total — well above the 50-char minTextLength. But every
          // page's per-page text is empty: classic image-only PDF.
          text: '\n\n-- 1 of 6 --\n\n\n\n-- 2 of 6 --\n\n\n\n-- 3 of 6 --\n\n\n\n-- 4 of 6 --\n\n\n\n-- 5 of 6 --\n\n\n\n-- 6 of 6 --\n\n',
          numpages: 6,
          pages: [
            { text: '', num: 1 },
            { text: '', num: 2 },
            { text: '', num: 3 },
            { text: '', num: 4 },
            { text: '', num: 5 },
            { text: '', num: 6 },
          ],
        }),
      }));
      const extraction = {
        load_number: 'SCAN-007',
        rate_total_usd: 1600,
        broker_name: 'Ready2Xecute',
        stops: [
          { type: 'pickup', city: 'Kingfield', state: 'ME' },
          { type: 'delivery', city: 'Manchester', state: 'CT' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('pdf'), 'sq-107.pdf', 'text-first');

      expect(result.parsing.actualStrategy).toBe('vision');
      expect(result.parsing.fallbackUsed).toBe(true);
      expect(result.parsing.fallbackReason).toBe('text_extraction_too_short');
    });

    it('should use text-first for a real digital PDF with rich per-page text', async () => {
      const { PDFParse } = await import('pdf-parse');
      const richPage =
        'Carrier Rate Confirmation Load 4145047-1 Rate 950.00 USD Pickup North Reading MA Delivery Bellmawr NJ '.repeat(
          3,
        );
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({
          text: richPage + '\n\n' + richPage,
          numpages: 2,
          pages: [
            { text: richPage, num: 1 },
            { text: richPage, num: 2 },
          ],
        }),
      }));
      const extraction = {
        load_number: '4145047-1',
        rate_total_usd: 950,
        broker_name: 'Armstrong Transport Group',
        stops: [
          { type: 'pickup', city: 'North Reading', state: 'MA' },
          { type: 'delivery', city: 'Bellmawr', state: 'NJ' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('pdf'), 'digital.pdf', 'text-first');

      expect(result.parsing.actualStrategy).toBe('text-first');
      expect(result.parsing.fallbackUsed).toBe(false);
    });

    it('should respect RATECON_MIN_TEXT_LENGTH env override', async () => {
      const { PDFParse } = await import('pdf-parse');
      // Text is 80 chars — long enough for default 50, but below override of 200.
      (PDFParse as unknown as jest.Mock).mockImplementationOnce(() => ({
        getText: jest.fn().mockResolvedValue({
          text: 'Load 1 Rate $100 Pickup Dallas TX Delivery Houston TX padding padding padding xx',
          numpages: 1,
        }),
      }));
      const extraction = {
        load_number: 'OVERRIDE-001',
        rate_total_usd: 100,
        broker_name: 'B',
        stops: [
          { type: 'pickup', city: 'A', state: 'TX' },
          { type: 'delivery', city: 'B', state: 'TX' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      process.env.RATECON_MIN_TEXT_LENGTH = '200';
      try {
        const result = await service.parse(Buffer.from('pdf'), 'sparse.pdf', 'text-first');
        // Threshold raised to 200 → 80-char extraction triggers vision escalation.
        expect(result.parsing.actualStrategy).toBe('vision');
        expect(result.parsing.fallbackReason).toBe('text_extraction_too_short');
      } finally {
        delete process.env.RATECON_MIN_TEXT_LENGTH;
      }
    });
  });

  describe('parse - vision strategy', () => {
    it('should extract data from PDF via vision', async () => {
      const extraction = {
        load_number: 'VIS-001',
        rate_total_usd: 3000,
        broker_name: 'Vision Broker',
        stops: [
          { type: 'pickup', city: 'Chicago', state: 'IL' },
          { type: 'delivery', city: 'Detroit', state: 'MI' },
        ],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('fake-pdf'), 'scanned-ratecon.pdf', 'vision');

      expect(result.data.load_number).toBe('VIS-001');
      expect(result.parsing.actualStrategy).toBe('vision');
      expect(result.parsing.fallbackUsed).toBe(false);
      expect(result.parsing.textExtractionChars).toBeNull();
    });

    it('should fail when vision primary returns null and fallback disabled', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'false';
      mockStructuredOutput.extract.mockResolvedValue({ object: null });

      await expect(service.parse(Buffer.from('pdf'), 'test.pdf', 'vision')).rejects.toThrow(BadRequestException);

      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should use fallback model for vision when primary fails', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      const extraction = {
        load_number: 'FB-001',
        rate_total_usd: 2500,
        broker_name: 'Fallback Broker',
        stops: [{ type: 'pickup', city: 'NY', state: 'NY' }],
      };
      mockStructuredOutput.extract
        .mockResolvedValueOnce({ object: null })
        .mockResolvedValueOnce({ object: extraction });

      const result = await service.parse(Buffer.from('fake-pdf'), 'scanned.pdf', 'vision');

      expect(result.data.load_number).toBe('FB-001');
      expect(result.parsing.actualStrategy).toBe('vision');
      expect(result.parsing.fallbackUsed).toBe(true);
      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should throw when vision both models fail', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      mockStructuredOutput.extract
        .mockRejectedValueOnce(new Error('Vision error'))
        .mockRejectedValueOnce(new Error('Fallback error'));

      await expect(service.parse(Buffer.from('pdf'), 'test.pdf', 'vision')).rejects.toThrow();

      delete process.env.RATECON_FALLBACK_ENABLED;
    });
  });

  // SQ-107 — Defense in depth: even with the right text/vision routing, the
  // model can satisfy the Zod schema by emitting placeholder strings (the
  // original bug: '<UNKNOWN>' in required fields, then a "successful" draft
  // with garbage data). Reject sentinel values post-parse so the existing
  // fallback chain retries with the powerful model. If both fail, the
  // processor's catch-all marks the job failed — NO stub draft.
  describe('extraction guardrail (SQ-107)', () => {
    it('should retry with fallback model when primary returns <UNKNOWN> for load_number', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      const garbage = {
        load_number: '<UNKNOWN>',
        rate_total_usd: 1600,
        broker_name: 'Ready2Xecute',
        stops: [
          { type: 'pickup', city: 'Kingfield', state: 'ME' },
          { type: 'delivery', city: 'Manchester', state: 'CT' },
        ],
      };
      const real = { ...garbage, load_number: '0287095' };
      mockStructuredOutput.extract.mockResolvedValueOnce({ object: garbage }).mockResolvedValueOnce({ object: real });

      const result = await service.parse(Buffer.from('pdf'), 'guardrail.pdf', 'text-first');

      expect(result.data.load_number).toBe('0287095');
      expect(result.parsing.fallbackUsed).toBe(true);
      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it.each([['<UNKNOWN>'], ['UNKNOWN'], ['__UNREADABLE__'], [''], ['<NOT_FOUND>'], ['n/a']])(
      'should reject placeholder value %s for required fields',
      async (placeholder) => {
        process.env.RATECON_FALLBACK_ENABLED = 'false';
        mockStructuredOutput.extract.mockResolvedValue({
          object: {
            load_number: placeholder,
            rate_total_usd: 1000,
            broker_name: 'Some Broker',
            stops: [{ type: 'pickup', city: 'A', state: 'TX' }],
          },
        });

        await expect(service.parse(Buffer.from('pdf'), 'sentinel.pdf', 'text-first')).rejects.toThrow(
          BadRequestException,
        );
        delete process.env.RATECON_FALLBACK_ENABLED;
      },
    );

    it('should reject placeholder broker_name even when load_number is valid', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'false';
      mockStructuredOutput.extract.mockResolvedValue({
        object: {
          load_number: 'L123',
          rate_total_usd: 1000,
          broker_name: '<UNKNOWN>',
          stops: [{ type: 'pickup', city: 'A', state: 'TX' }],
        },
      });

      await expect(service.parse(Buffer.from('pdf'), 'broker-sentinel.pdf', 'text-first')).rejects.toThrow(
        BadRequestException,
      );
      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should pass through real-looking values that contain "unknown" as substring', async () => {
      // Edge case: don't false-positive on legitimate values like "Unknown Lane Routing Inc"
      // that happen to contain the word "unknown".
      const extraction = {
        load_number: 'UK-2026-0001',
        rate_total_usd: 1500,
        broker_name: 'Unknown Lane Routing Inc',
        stops: [{ type: 'pickup', city: 'A', state: 'TX' }],
      };
      mockStructuredOutput.extract.mockResolvedValue({ object: extraction });

      const result = await service.parse(Buffer.from('pdf'), 'edge.pdf', 'text-first');

      expect(result.data.load_number).toBe('UK-2026-0001');
      expect(result.data.broker_name).toBe('Unknown Lane Routing Inc');
    });

    it('should apply same guardrail to vision path', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'false';
      mockStructuredOutput.extract.mockResolvedValue({
        object: {
          load_number: '<UNKNOWN>',
          rate_total_usd: 1000,
          broker_name: '<UNKNOWN>',
          stops: [],
        },
      });

      await expect(service.parse(Buffer.from('pdf'), 'vision-sentinel.pdf', 'vision')).rejects.toThrow(
        BadRequestException,
      );
      delete process.env.RATECON_FALLBACK_ENABLED;
    });
  });

  describe('classifyError', () => {
    it('should classify auth errors', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      mockStructuredOutput.extract
        .mockRejectedValueOnce(new Error('401 Unauthorized'))
        .mockRejectedValueOnce(new Error('401 Unauthorized'));

      await expect(service.parse(Buffer.from('fake-pdf'), 'test.pdf', 'text-first')).rejects.toThrow(
        /authentication failed/i,
      );
      delete process.env.RATECON_FALLBACK_ENABLED;
    });

    it('should classify rate limit errors', async () => {
      process.env.RATECON_FALLBACK_ENABLED = 'true';
      mockStructuredOutput.extract
        .mockRejectedValueOnce(new Error('429 rate limit'))
        .mockRejectedValueOnce(new Error('429 rate limit'));

      await expect(service.parse(Buffer.from('fake-pdf'), 'test.pdf', 'text-first')).rejects.toThrow(/rate limit/i);
      delete process.env.RATECON_FALLBACK_ENABLED;
    });
  });
});
