import { apiClient } from '@/shared/lib/api';

export interface DomainEventLogEntry {
  id: string;
  tenantId: string;
  event: string;
  aggregateType: string;
  aggregateId: string | null;
  actorId: string | null;
  actorType: string | null;
  actorLabel: string | null;
  correlationId: string | null;
  version: number;
  visibility: 'external' | 'internal';
  data: any;
  createdAt: string;
}

export interface PaginatedEventLogs {
  items: DomainEventLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface EventStatsEntry {
  event: string;
  count: number;
}

export interface EventVolumePoint {
  hour: string;
  event: string;
  count: number;
}

export interface WebhookHealthEntry {
  tenantId: string;
  total: number;
  delivered: number;
  failed: number;
  successRate: number;
}

export const adminEventsApi = {
  listEvents: async (params?: {
    search?: string;
    tenant?: string;
    actorType?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedEventLogs> => {
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.set('search', params.search);
    if (params?.tenant) queryParams.set('tenant', params.tenant);
    if (params?.actorType) queryParams.set('actorType', params.actorType);
    if (params?.since) queryParams.set('since', params.since);
    if (params?.until) queryParams.set('until', params.until);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    const qs = queryParams.toString();
    return apiClient(`/admin/events${qs ? `?${qs}` : ''}`);
  },

  getStats: async (): Promise<EventStatsEntry[]> => {
    return apiClient('/admin/events/stats');
  },

  getVolume: async (): Promise<EventVolumePoint[]> => {
    return apiClient('/admin/events/volume');
  },

  getWebhookHealth: async (): Promise<WebhookHealthEntry[]> => {
    const res = await apiClient<{ since: string; tenants: WebhookHealthEntry[]; summary: any }>(
      '/admin/events/webhooks/health',
    );
    return res.tenants;
  },
};
