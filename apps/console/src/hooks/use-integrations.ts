'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export interface IntegrationConfig {
  id: string;
  integrationType: string;
  vendor: string;
  displayName: string;
  isEnabled: boolean;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface SyncLog {
  id: string;
  integrationId: string;
  syncType: string;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface IntegrationHealthItem {
  id: string;
  vendor: string;
  displayName: string;
  isEnabled: boolean;
  status: string;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  hasError: boolean;
  lastErrorMessage: string | null;
}

export interface IntegrationHealth {
  hasIntegrations: boolean;
  activeSyncs: { type: string; vendor: string; syncType: string; startedAt: string }[];
  configuredTypes?: string[];
  integrations?: IntegrationHealthItem[];
  lastSyncByType?: Record<string, string | null>;
}

export function useIntegrations() {
  return useQuery<IntegrationConfig[]>({
    queryKey: ['integrations'],
    queryFn: () => api.get('/integrations'),
  });
}

export function useIntegrationHealth() {
  return useQuery<IntegrationHealth>({
    queryKey: ['integrations', 'health'],
    queryFn: () => api.get<IntegrationHealth>('/integrations/health'),
  });
}

export function useSyncHistory(integrationId?: string) {
  return useQuery<SyncLog[]>({
    queryKey: ['integrations', 'sync-history', integrationId],
    queryFn: async () => {
      if (integrationId) {
        // Per-integration endpoint returns an array directly
        return api.get(`/integrations/${integrationId}/sync-history?limit=50`);
      }
      // Unified endpoint returns { items, total, limit, offset }
      const res = await api.get<{ items: SyncLog[] }>('/integrations/sync-history?limit=50');
      return Array.isArray(res) ? res : (res.items ?? []);
    },
    enabled: true,
  });
}
