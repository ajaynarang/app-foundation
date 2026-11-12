/**
 * Timers API client — read-only, super-admin scoped. Mirrors the backend `admin/deadlines` controller (ADR "Outbox and deadlines").
 * The list is cursor-paged; pass `cursor` from the previous page's `nextCursor`.
 */
import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { DeadlineListResponse, DeadlineListSort, DeadlineState, DurabilityHealth } from '@app/shared-types';

export interface DeadlineListParams {
  states?: DeadlineState[];
  kind?: string;
  /** The tenant's slug. */
  tenant?: string;
  sort?: DeadlineListSort;
  cursor?: string;
}

function toQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.append(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const timersApi = {
  /** One page of deadlines across tenants (`{ items, nextCursor, total, counts }`). States are comma-joined. */
  list: ({ states, ...params }: DeadlineListParams) =>
    apiClient<DeadlineListResponse>(`/admin/deadlines${toQuery({ ...params, state: states?.join(',') })}`),

  /** The kinds on record — the kind filter's options. */
  kinds: () => apiClient<string[]>('/admin/deadlines/kinds'),

  /** Pending / failing / overdue deadlines and the outbox backlog (null only when no reader is bound). */
  health: () => apiClient<DurabilityHealth>('/admin/deadlines/health'),
};
