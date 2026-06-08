import { useQuery } from '@tanstack/react-query';
import { adminEventsApi } from './api';
import { apiClient } from '@/shared/lib/api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';

export const ADMIN_EVENTS_KEYS = {
  events: (filters: Record<string, any>) => ['admin-events', 'list', filters] as const,
  stats: () => ['admin-events', 'stats'] as const,
  volume: () => ['admin-events', 'volume'] as const,
  webhookHealth: () => ['admin-events', 'webhook-health'] as const,
  tenants: () => ['admin-events', 'tenants'] as const,
};

export function useAdminEvents(
  filters: {
    search?: string;
    tenant?: string;
    actorType?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  },
  options?: { autoRefresh?: boolean },
) {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEYS.events(filters),
    queryFn: () => adminEventsApi.listEvents(filters),
    ...QUERY_TIERS.ACTIVE_POLL,
    refetchInterval: options?.autoRefresh ? 10_000 : false,
  });
}

export function useEventStats() {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEYS.stats(),
    queryFn: adminEventsApi.getStats,
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

export function useEventVolume() {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEYS.volume(),
    queryFn: adminEventsApi.getVolume,
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

export function useWebhookHealth() {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEYS.webhookHealth(),
    queryFn: adminEventsApi.getWebhookHealth,
    ...QUERY_TIERS.ACTIVE_POLL,
  });
}

export function useTenantList() {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEYS.tenants(),
    queryFn: (): Promise<{ id: number; tenantId: string; companyName: string }[]> =>
      apiClient('/support/admin/tenants'),
    staleTime: 5 * 60 * 1000,
  });
}
