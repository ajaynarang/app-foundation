import { createCohere as createCohereImport } from '@ai-sdk/cohere';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { makeResolver, TENANT } from './resolver-fixtures';

const mockEmbed = jest.fn();
const mockEmbedMany = jest.fn();
jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  embed: (...args: unknown[]) => mockEmbed(...args),
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

jest.mock('@ai-sdk/cohere', () => ({
  ...jest.requireActual('@ai-sdk/cohere'),
  createCohere: jest.fn(jest.requireActual('@ai-sdk/cohere').createCohere),
}));

const createCohere = createCohereImport as jest.Mock;

/**
 * A zero-retention tenant's text must fail CLOSED before it can reach an embedding provider. Before the resolver, the
 * zero-retention guard took a language alias, so embeddings had none and tenant content went to a retaining vendor
 * unguarded. With the guard in the resolver the block is structural: no Cohere client is even constructed.
 *
 * Mutation contract: removing the retention filter in `AiRouteResolver.candidatePools` makes this spec fail by
 * resolving `platform-cohere` for a zero-retention tenant, which is the leak, named. Through `EmbeddingService` (the
 * only embedding path) no `embed` or `embedMany` call happens either.
 */
describe('zero-retention tenant embedding fails closed', () => {
  beforeEach(() => {
    createCohere.mockClear();
    mockEmbed.mockReset();
    mockEmbedMany.mockReset();
  });

  it('throws ZeroRetentionUnavailable while a standard Cohere route is configured, and never builds it', async () => {
    const { resolver } = makeResolver({ aiZeroRetention: true, config: { cohereApiKey: 'co-test' } });
    await expect(resolver.resolve(TENANT, 'embedding')).rejects.toThrow(ZeroRetentionUnavailable);
    expect(createCohere).not.toHaveBeenCalled();
  });

  it('the same route serves a standard tenant (fail-closed, not fail-always)', async () => {
    const { resolver } = makeResolver({ config: { cohereApiKey: 'co-test' } });
    const route = await resolver.resolve(TENANT, 'embedding');
    expect(route.routeId).toBe('platform-cohere');
    expect(createCohere).toHaveBeenCalledTimes(1);
  });

  it('the same tenant WITH a zero-retention platform route embeds on Bedrock (fail-closed, not fail-always)', async () => {
    const { resolver } = makeResolver({
      aiZeroRetention: true,
      config: { cohereApiKey: 'co-test', platformBedrockRegion: 'us-east-1' },
    });
    mockEmbedMany.mockResolvedValue({ embeddings: [new Array(1536).fill(0)], usage: { tokens: 3 } });
    const telemetry = { record: jest.fn() };
    const service = new EmbeddingService(telemetry as never, resolver);

    const vectors = await service.embedBatch(['text'], { tenantId: TENANT, surface: 'EMBEDDING' as const }, 'document');
    expect(vectors).toHaveLength(1);
    expect(mockEmbedMany).toHaveBeenCalledTimes(1);
    expect(mockEmbedMany.mock.calls[0][0].model).toMatchObject({ modelId: 'cohere.embed-v4:0' });
    // The standard Cohere route is configured and still never built for this tenant.
    expect(createCohere).not.toHaveBeenCalled();
  });

  it('EmbeddingService sends nothing for that tenant: no embed call, no ledger row', async () => {
    const { resolver } = makeResolver({ aiZeroRetention: true, config: { cohereApiKey: 'co-test' } });
    const telemetry = { record: jest.fn() };
    const service = new EmbeddingService(telemetry as never, resolver);
    const ctx = { tenantId: TENANT, surface: 'EMBEDDING' as const };

    await expect(service.embedText('private', ctx, 'query')).rejects.toThrow(ZeroRetentionUnavailable);
    await expect(service.embedBatch(['private'], ctx, 'document')).rejects.toThrow(ZeroRetentionUnavailable);
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockEmbedMany).not.toHaveBeenCalled();
    expect(telemetry.record).not.toHaveBeenCalled();
    expect(createCohere).not.toHaveBeenCalled();
  });
});
