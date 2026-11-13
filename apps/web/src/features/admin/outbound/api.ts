/**
 * Outbound API client — super-admin scoped. Mirrors the backend `super-admin/outbound` controller (ADR "Outbound gate").
 */
import { apiClient } from '@appshore/web-core/shared/lib/api';
import type {
  CreateOutboundAllowEntryInput,
  OutboundAllowEntry,
  OutboundStatus,
  OutboundSuppressionList,
} from '@app/shared-types';

const BASE = '/super-admin/outbound';

export const outboundApi = {
  /** Live or allowlist, and the environment. */
  status: () => apiClient<OutboundStatus>(`${BASE}/status`),

  /** Every allow-list entry, by kind then value. */
  listEntries: () => apiClient<OutboundAllowEntry[]>(`${BASE}/allow-list`),

  createEntry: (input: CreateOutboundAllowEntryInput) =>
    apiClient<OutboundAllowEntry>(`${BASE}/allow-list`, { method: 'POST', body: JSON.stringify(input) }),

  deleteEntry: (entryId: string) => apiClient<void>(`${BASE}/allow-list/${entryId}`, { method: 'DELETE' }),

  /** One page of held-back sends, newest first. */
  listHeldBack: (cursor?: string) =>
    apiClient<OutboundSuppressionList>(`${BASE}/held-back${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
};
