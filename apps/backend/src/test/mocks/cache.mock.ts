/**
 * Mock cache service for unit tests.
 */

export function createMockCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn().mockImplementation(async (_key: string, factory: () => Promise<any>) => factory()),
    invalidate: jest.fn().mockResolvedValue(undefined),
    bustStatsCache: jest.fn().mockResolvedValue(undefined),
  };
}
