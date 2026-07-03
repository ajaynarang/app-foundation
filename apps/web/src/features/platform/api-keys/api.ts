import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { ApiKeyResponse, AgentScope } from '@app/shared-types';

/**
 * Tenant-level admin view row (extended via Phase D). Adds keyMasked
 * + a few housekeeping fields not present on ApiKeyResponse.
 */
export interface TenantApiKeyListItem extends ApiKeyResponse {
  keyMasked: string;
  userId: number;
  revokedAt: string | null;
}

export interface RotateApiKeyResponse {
  apiKey: ApiKeyResponse;
  plaintextKey: string;
}

export const apiKeysApi = {
  listTenant: (): Promise<TenantApiKeyListItem[]> => apiClient<TenantApiKeyListItem[]>('/api-keys/admin/tenant'),

  rotate: (id: number): Promise<RotateApiKeyResponse> =>
    apiClient<RotateApiKeyResponse>(`/api-keys/${id}/rotate`, {
      method: 'POST',
    }),

  pause: (id: number): Promise<void> => apiClient<void>(`/api-keys/${id}/pause`, { method: 'POST' }),

  resume: (id: number): Promise<void> => apiClient<void>(`/api-keys/${id}/resume`, { method: 'POST' }),

  revoke: (id: number): Promise<void> => apiClient<void>(`/api-keys/${id}/revoke`, { method: 'POST' }),

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
