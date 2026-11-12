import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { ApiKeyResponse, AgentScope, CursorList } from '@app/shared-types';

/**
 * Tenant-level admin view row. Adds a few housekeeping fields not present
 * on ApiKeyResponse. The server stores only a hash of each key, so a row
 * carries `keyMasked` (prefix and last four characters), never the key.
 */
export interface TenantApiKeyListItem extends ApiKeyResponse {
  userId: number;
  revokedAt: string | null;
}

export interface RotateApiKeyResponse {
  apiKey: ApiKeyResponse;
  plaintextKey: string;
}

export const apiKeysApi = {
  /** A cursor list, newest first: pass `cursor` from the previous page's `nextCursor`. */
  listTenant: (cursor?: string): Promise<CursorList<TenantApiKeyListItem>> =>
    apiClient<CursorList<TenantApiKeyListItem>>(
      `/api-keys/admin/tenant${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  rotate: (id: number): Promise<RotateApiKeyResponse> =>
    apiClient<RotateApiKeyResponse>(`/api-keys/${id}/rotate`, {
      method: 'POST',
    }),

  pause: (id: number): Promise<ApiKeyResponse> =>
    apiClient<ApiKeyResponse>(`/api-keys/${id}/pause`, { method: 'POST' }),

  resume: (id: number): Promise<ApiKeyResponse> =>
    apiClient<ApiKeyResponse>(`/api-keys/${id}/resume`, { method: 'POST' }),

  revoke: (id: number): Promise<ApiKeyResponse> =>
    apiClient<ApiKeyResponse>(`/api-keys/${id}/revoke`, { method: 'POST' }),

  updateScopes: (
    id: number,
    payload: {
      scopes: AgentScope[];
      ipAllowlist?: string[];
      rateLimitPerMinute?: number;
    },
  ): Promise<ApiKeyResponse> =>
    apiClient<ApiKeyResponse>(`/api-keys/${id}/scopes`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
