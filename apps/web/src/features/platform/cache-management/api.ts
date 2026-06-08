import { apiClient } from '@/shared/lib/api/client';

export interface CacheHealthResponse {
  status: string;
  /**
   * What the cache is actually backed by ('redis' today; future could be 'memory' for an
   * opt-in dev mode). Lets the UI honestly tell the operator where reads/writes go.
   */
  backend: 'redis' | 'memory';
  uptime?: string;
  memoryUsed?: string;
  memoryPeak?: string;
  connectedClients?: string;
  totalKeys?: string;
  redisVersion?: string;
  message?: string;
}

export interface CacheStatsResponse {
  namespaces: string[];
  metrics: Record<string, { hits: number; misses: number }>;
  keyCounts: Record<string, number>;
}

export interface CacheFlushResponse {
  flushed: number;
  scope: string;
}

export const cacheManagementApi = {
  getHealth: () => apiClient<CacheHealthResponse>('/admin/cache/health'),
  getStats: () => apiClient<CacheStatsResponse>('/admin/cache/stats'),
  flushAll: () =>
    apiClient<CacheFlushResponse>('/admin/cache/flush', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),
  flushNamespace: (namespace: string) =>
    apiClient<CacheFlushResponse>(`/admin/cache/flush/${namespace}`, {
      method: 'POST',
    }),
};
