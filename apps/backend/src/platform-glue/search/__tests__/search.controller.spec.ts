import { Test } from '@nestjs/testing';
import { SearchController } from '../search.controller';
import { SEARCH_PROVIDERS, SearchProvider, SearchResult } from '../search.provider';

const mockUser = { dbId: 7, tenantDbId: 42 };

function buildResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    type: 'widget',
    id: 'w-1',
    label: 'Widget One',
    description: 'A widget',
    href: '/widgets/w-1',
    ...overrides,
  };
}

async function buildController(providers?: SearchProvider[]): Promise<SearchController> {
  const module = await Test.createTestingModule({
    controllers: [SearchController],
    providers: [{ provide: SEARCH_PROVIDERS, useValue: providers ?? [] }],
  }).compile();

  return module.get(SearchController);
}

describe('SearchController', () => {
  it('returns empty results when no providers are registered', async () => {
    const controller = await buildController();
    const result = await controller.search(mockUser, 'invoice');
    expect(result).toEqual({ results: [] });
  });

  it('returns empty results without calling providers for short queries', async () => {
    const provider: SearchProvider = { search: jest.fn() };
    const controller = await buildController([provider]);

    expect(await controller.search(mockUser, '')).toEqual({ results: [] });
    expect(await controller.search(mockUser, 'a')).toEqual({ results: [] });
    expect(await controller.search(mockUser, undefined)).toEqual({ results: [] });
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('concatenates results across providers and passes tenant + query', async () => {
    const providerA: SearchProvider = {
      search: jest.fn().mockResolvedValue([buildResult({ id: 'a-1', type: 'customer' })]),
    };
    const providerB: SearchProvider = {
      search: jest.fn().mockResolvedValue([buildResult({ id: 'b-1' }), buildResult({ id: 'b-2' })]),
    };
    const controller = await buildController([providerA, providerB]);

    const result = await controller.search(mockUser, 'acme');

    expect(providerA.search).toHaveBeenCalledWith(42, 'acme');
    expect(providerB.search).toHaveBeenCalledWith(42, 'acme');
    expect(result.results.map((r) => r.id)).toEqual(['a-1', 'b-1', 'b-2']);
  });

  it('caps results at the requested limit', async () => {
    const provider: SearchProvider = {
      search: jest
        .fn()
        .mockResolvedValue([buildResult({ id: '1' }), buildResult({ id: '2' }), buildResult({ id: '3' })]),
    };
    const controller = await buildController([provider]);

    const result = await controller.search(mockUser, 'acme', '2');
    expect(result.results).toHaveLength(2);
  });

  it('ignores a failing provider and returns the healthy ones', async () => {
    const failing: SearchProvider = { search: jest.fn().mockRejectedValue(new Error('boom')) };
    const healthy: SearchProvider = { search: jest.fn().mockResolvedValue([buildResult({ id: 'ok' })]) };
    const controller = await buildController([failing, healthy]);

    const result = await controller.search(mockUser, 'acme');
    expect(result.results.map((r) => r.id)).toEqual(['ok']);
  });
});
