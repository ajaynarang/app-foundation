import { EmbeddingService } from '../embedding.service';
import type { AiCallContext } from '@sally/shared-types';

const mockEmbed = jest.fn();
const mockEmbedMany = jest.fn();

jest.mock('ai', () => ({
  embed: (...args: unknown[]) => mockEmbed(...args),
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

jest.mock('../ai-provider', () => ({
  aiEmbedding: jest.fn().mockReturnValue('mock-embedding-model'),
  EMBEDDING_MODEL_ID: 'text-embedding-3-small',
  EMBEDDING_PROVIDER_LABEL: 'openai',
}));

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let aiTelemetry: { record: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    aiTelemetry = { record: jest.fn().mockResolvedValue({ id: 'inv-emb' }) };
    service = new EmbeddingService(aiTelemetry as any);

    mockEmbed.mockResolvedValue({
      embedding: new Array(1536).fill(0.1),
      usage: { tokens: 42 },
    });

    mockEmbedMany.mockResolvedValue({
      embeddings: [new Array(1536).fill(0.1), new Array(1536).fill(0.2)],
      usage: { tokens: 100 },
    });
  });

  describe('embedText', () => {
    it('should return a 1536-dimensional vector for a single text', async () => {
      const result = await service.embedText('What is route planning?');
      expect(result).toHaveLength(1536);
      expect(typeof result[0]).toBe('number');
      expect(mockEmbed).toHaveBeenCalledWith({
        model: 'mock-embedding-model',
        value: 'What is route planning?',
      });
    });

    it('skips telemetry when no aiContext supplied', async () => {
      await service.embedText('hello');
      expect(aiTelemetry.record).not.toHaveBeenCalled();
    });

    it('records telemetry with input-only tokens when aiContext supplied', async () => {
      const ctx: AiCallContext = { tenantId: 9, surface: 'MEMORY_EXTRACT', agentId: 'memory' };
      await service.embedText('hello', ctx);

      expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
      const [usage, passedCtx] = aiTelemetry.record.mock.calls[0];
      expect(usage).toMatchObject({
        provider: 'openai',
        model: 'text-embedding-3-small',
        promptTokens: 42,
        completionTokens: 0,
        totalTokens: 42,
        status: 'OK',
      });
      expect(usage.latencyMs).toEqual(expect.any(Number));
      expect(passedCtx).toBe(ctx);
    });

    it('records zero tokens when usage block is missing', async () => {
      mockEmbed.mockResolvedValue({ embedding: new Array(1536).fill(0) });
      const ctx: AiCallContext = { tenantId: 1, surface: 'EMBEDDING' };
      await service.embedText('x', ctx);

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.promptTokens).toBe(0);
    });

    it('does not break embedding when telemetry throws', async () => {
      aiTelemetry.record.mockRejectedValue(new Error('db down'));
      const result = await service.embedText('hello', { tenantId: 1, surface: 'EMBEDDING' });
      expect(result).toHaveLength(1536);
    });
  });

  describe('embedBatch', () => {
    it('should return vectors for multiple texts', async () => {
      const results = await service.embedBatch(['Route planning overview', 'HOS compliance features']);
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(1536);
      expect(results[1]).toHaveLength(1536);
      expect(mockEmbedMany).toHaveBeenCalledWith({
        model: 'mock-embedding-model',
        values: ['Route planning overview', 'HOS compliance features'],
      });
    });

    it('records a single telemetry row per batch (not per text)', async () => {
      const ctx: AiCallContext = { tenantId: 5, surface: 'KB_INGEST' };
      await service.embedBatch(['a', 'b', 'c'], ctx);

      expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(0);
    });

    it('reads inputTokens variant for usage', async () => {
      mockEmbedMany.mockResolvedValue({
        embeddings: [new Array(1536).fill(0)],
        usage: { inputTokens: 25 },
      });
      const ctx: AiCallContext = { tenantId: 1, surface: 'KB_INGEST' };
      await service.embedBatch(['hi'], ctx);

      const [usage] = aiTelemetry.record.mock.calls[0];
      expect(usage.promptTokens).toBe(25);
    });
  });
});
