export { cacheManagementApi } from './api';
export type { CacheHealthResponse, CacheStatsResponse, CacheFlushResponse } from './api';
export { useCacheHealth, useCacheStats, useFlushNamespace, useFlushAll } from './hooks/use-cache-management';
