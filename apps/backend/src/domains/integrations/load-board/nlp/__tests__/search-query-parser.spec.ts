// Mock ESM-only Mastra packages before imports
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('../../../../../domains/prompting', () => ({
  PromptingService: jest.fn(),
  PROMPT_NAMES: { LOAD_BOARD_SEARCH_PARSER: 'sally-load-board-search-parser' },
}));

import { SearchQueryParser } from '../search-query-parser';

describe('SearchQueryParser', () => {
  let parser: SearchQueryParser;
  const mockStructuredOutputService = {
    extract: jest.fn(),
  };

  const mockPromptService = {
    getPrompt: jest.fn().mockResolvedValue('You are a load board search parser.'),
  };

  beforeEach(() => {
    parser = new SearchQueryParser(mockStructuredOutputService as any, mockPromptService as any);
    jest.clearAllMocks();
  });

  it('extracts origin and equipment from natural language', async () => {
    mockStructuredOutputService.extract.mockResolvedValue({
      object: {
        originCity: 'Chicago',
        originState: 'IL',
        destinationCity: null,
        destinationState: null,
        equipmentTypes: ['van'],
        minRatePerMile: null,
        maxDeadheadMiles: null,
        minWeight: null,
        maxWeight: null,
      },
    });

    const result = await parser.parse('van loads out of Chicago');

    expect(result).toEqual(
      expect.objectContaining({
        originCity: 'Chicago',
        originState: 'IL',
        equipmentTypes: ['van'],
      }),
    );
  });

  it('extracts full route with rate filter', async () => {
    mockStructuredOutputService.extract.mockResolvedValue({
      object: {
        originCity: 'Memphis',
        originState: 'TN',
        destinationCity: 'Atlanta',
        destinationState: 'GA',
        equipmentTypes: ['reefer'],
        minRatePerMile: 3.0,
        maxDeadheadMiles: null,
        minWeight: null,
        maxWeight: null,
      },
    });

    const result = await parser.parse('reefer loads from Memphis to Atlanta paying $3+');

    expect(result).toEqual(
      expect.objectContaining({
        originCity: 'Memphis',
        originState: 'TN',
        destinationCity: 'Atlanta',
        destinationState: 'GA',
        minRatePerMile: 3.0,
      }),
    );
  });

  it('returns null when no origin extracted', async () => {
    mockStructuredOutputService.extract.mockResolvedValue({
      object: {
        originCity: null,
        originState: null,
        destinationCity: null,
        destinationState: null,
        equipmentTypes: null,
        minRatePerMile: null,
        maxDeadheadMiles: null,
        minWeight: null,
        maxWeight: null,
      },
    });

    const result = await parser.parse('show me something');
    expect(result).toBeNull();
  });

  it('returns null on LLM timeout', async () => {
    mockStructuredOutputService.extract.mockRejectedValue(new Error('Timeout'));
    const result = await parser.parse('van loads out of Chicago');
    expect(result).toBeNull();
  });

  it('returns null when LLM returns no object', async () => {
    mockStructuredOutputService.extract.mockResolvedValue({ object: null });
    const result = await parser.parse('van loads out of Chicago');
    expect(result).toBeNull();
  });
});
