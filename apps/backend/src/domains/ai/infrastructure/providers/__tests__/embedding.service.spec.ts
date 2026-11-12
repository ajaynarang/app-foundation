import { InternalServerErrorException, Logger } from '@nestjs/common';
import type { AiCallContext } from '@app/shared-types';

import { EmbeddingService } from '../embedding.service';
import { makeResolver } from '../../../routing/__tests__/resolver-fixtures';
import { AiNotConfigured } from '../../../routing/ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../../redaction/zero-retention-unavailable.error';
import { AiProviderCreditRefused } from '../../telemetry/ai-provider-credit-refused.error';

const mockEmbed = jest.fn();
const mockEmbedMany = jest.fn();

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  embed: (...args: unknown[]) => mockEmbed(...args),
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

const COHERE = { cohereApiKey: 'co-test' };
const CTX: AiCallContext = { tenantId: 7, surface: 'EMBEDDING' };
const vector = (fill: number, length = 1536) => new Array(length).fill(fill);

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let aiTelemetry: { record: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    aiTelemetry = { record: jest.fn().mockResolvedValue({ id: 'inv-emb' }) };
    // A real resolver on the platform Cohere route; the provider call itself is mocked (`embed`, `embedMany`).
    service = new EmbeddingService(aiTelemetry as any, makeResolver({ config: COHERE }).resolver);
    mockEmbed.mockResolvedValue({ embedding: vector(0.1), usage: { tokens: 42 } });
    mockEmbedMany.mockResolvedValue({ embeddings: [vector(0.1), vector(0.2)], usage: { tokens: 100 } });
  });

  describe('routing', () => {
    it("embeds on the tenant's resolved route: Cohere Embed v4", async () => {
      await service.embedText('What is the audit log?', CTX, 'query');
      expect(mockEmbed.mock.calls[0][0].model).toMatchObject({ modelId: 'embed-v4.0' });
    });

    it('refuses a zero-retention tenant before the text leaves: no embed call, no ledger row', async () => {
      service = new EmbeddingService(
        aiTelemetry as any,
        makeResolver({ aiZeroRetention: true, config: COHERE }).resolver,
      );
      await expect(service.embedText('secret', CTX, 'document')).rejects.toThrow(ZeroRetentionUnavailable);
      await expect(service.embedBatch(['secret'], CTX, 'document')).rejects.toThrow(ZeroRetentionUnavailable);
      expect(mockEmbed).not.toHaveBeenCalled();
      expect(mockEmbedMany).not.toHaveBeenCalled();
      expect(aiTelemetry.record).not.toHaveBeenCalled();
    });

    it('answers AiNotConfigured when no route serves embeddings, without calling a provider', async () => {
      service = new EmbeddingService(aiTelemetry as any, makeResolver().resolver);
      await expect(service.embedText('x', CTX, 'query')).rejects.toThrow(AiNotConfigured);
      await expect(service.embedForPlatform(['x'])).rejects.toThrow(AiNotConfigured);
      expect(mockEmbed).not.toHaveBeenCalled();
      expect(mockEmbedMany).not.toHaveBeenCalled();
    });
  });

  describe('intent', () => {
    it('sends a query as search_query at 1536 dimensions, under both provider keys', async () => {
      await service.embedText('q', CTX, 'query');
      expect(mockEmbed.mock.calls[0][0].providerOptions).toEqual({
        cohere: { inputType: 'search_query', outputDimension: 1536 },
        bedrock: { inputType: 'search_query', outputDimension: 1536 },
      });
    });

    it('sends stored text as search_document', async () => {
      await service.embedBatch(['a', 'b'], CTX, 'document');
      expect(mockEmbedMany.mock.calls[0][0].providerOptions.cohere).toEqual({
        inputType: 'search_document',
        outputDimension: 1536,
      });
    });

    it('embeds platform content as documents', async () => {
      await service.embedForPlatform(['a', 'b']);
      expect(mockEmbedMany.mock.calls[0][0].providerOptions.cohere.inputType).toBe('search_document');
    });
  });

  describe('dimension check', () => {
    it('refuses a vector of the wrong size before it can reach a vector(1536) column', async () => {
      mockEmbed.mockResolvedValue({ embedding: vector(0.1, 1024), usage: { tokens: 1 } });
      await expect(service.embedText('x', CTX, 'query')).rejects.toThrow(InternalServerErrorException);
    });

    it('checks every vector of a batch, and of a platform batch', async () => {
      mockEmbedMany.mockResolvedValue({ embeddings: [vector(0.1), vector(0.1, 3)], usage: { tokens: 1 } });
      await expect(service.embedBatch(['a', 'b'], CTX, 'document')).rejects.toThrow(InternalServerErrorException);
      await expect(service.embedForPlatform(['a', 'b'])).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('ledger', () => {
    it('records the route, its provider label and the embedding model, with input-only tokens', async () => {
      const ctx: AiCallContext = { tenantId: 9, surface: 'MEMORY_EXTRACT', agentId: 'memory' };
      const result = await service.embedText('hello', ctx, 'document');

      expect(result).toHaveLength(1536);
      expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
      const [usage, passedCtx] = aiTelemetry.record.mock.calls[0];
      expect(usage).toMatchObject({
        provider: 'cohere',
        model: 'embed-v4.0',
        routeId: 'platform-cohere',
        credentialType: 'PLATFORM_COHERE',
        promptTokens: 42,
        completionTokens: 0,
        totalTokens: 42,
        status: 'OK',
      });
      expect(usage.latencyMs).toEqual(expect.any(Number));
      expect(passedCtx).toBe(ctx);
    });

    it('records one row per batch, reading the inputTokens variant', async () => {
      mockEmbedMany.mockResolvedValue({ embeddings: [vector(0)], usage: { inputTokens: 25 } });
      await service.embedBatch(['hi'], CTX, 'document');
      expect(aiTelemetry.record).toHaveBeenCalledTimes(1);
      expect(aiTelemetry.record.mock.calls[0][0].promptTokens).toBe(25);
    });

    it('records zero tokens when the usage block is missing', async () => {
      mockEmbed.mockResolvedValue({ embedding: vector(0) });
      await service.embedText('x', CTX, 'query');
      expect(aiTelemetry.record.mock.calls[0][0].promptTokens).toBe(0);
    });

    it('records a failed provider call as an ERROR row and rethrows', async () => {
      mockEmbed.mockRejectedValue(new Error('provider down'));
      await expect(service.embedText('x', CTX, 'query')).rejects.toThrow('provider down');
      expect(aiTelemetry.record.mock.calls[0][0]).toMatchObject({ status: 'ERROR', promptTokens: 0 });
    });

    it('does not fail the embedding when the ledger write throws', async () => {
      aiTelemetry.record.mockRejectedValue(new Error('db down'));
      await expect(service.embedText('hello', CTX, 'query')).resolves.toHaveLength(1536);
    });

    it('writes no tenant ledger row for platform content', async () => {
      await service.embedForPlatform(['a', 'b']);
      expect(aiTelemetry.record).not.toHaveBeenCalled();
    });
  });

  describe('provider credit refusals', () => {
    const refusal = () => Object.assign(new Error('insufficient_quota'), { statusCode: 402 });
    afterEach(() => jest.restoreAllMocks());

    it('turns a refusal on tenant content into the budget error (single and batch), and records the failed row', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockEmbed.mockRejectedValue(refusal());
      mockEmbedMany.mockRejectedValue(refusal());
      await expect(service.embedText('x', CTX, 'query')).rejects.toBeInstanceOf(AiProviderCreditRefused);
      await expect(service.embedBatch(['x'], CTX, 'document')).rejects.toBeInstanceOf(AiProviderCreditRefused);
      expect(aiTelemetry.record).toHaveBeenCalledTimes(2);
    });

    it('logs a refusal on platform content at error level and rethrows it for the ingest to report', async () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const error = refusal();
      mockEmbedMany.mockRejectedValue(error);
      await expect(service.embedForPlatform(['a'])).rejects.toBe(error);
      expect(String(log.mock.calls[0][0])).toContain('platform-cohere');
    });
  });
});
