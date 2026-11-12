import { createCohere as createCohereImport } from '@ai-sdk/cohere';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';
import { makeResolver, TENANT } from './resolver-fixtures';

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
 * resolving `platform-cohere` for a zero-retention tenant, which is the leak, named. The embedding service moves onto
 * the resolver later; this spec then also asserts that no `embed` call happens.
 */
describe('zero-retention tenant embedding fails closed', () => {
  beforeEach(() => createCohere.mockClear());

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
});
