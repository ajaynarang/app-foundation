import { apiClient } from '@/shared/lib/api';
import type {
  OAuthClientResponse,
  OAuthClientCreatedResponse,
  CreateOAuthClientInput,
  AgentScope,
} from '@app/shared-types';

export type { OAuthClientResponse, OAuthClientCreatedResponse };

export async function createOAuthClient(input: CreateOAuthClientInput): Promise<OAuthClientCreatedResponse> {
  return apiClient<OAuthClientCreatedResponse>('/oauth/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Tenant-admin operations. */
export const oauthClientsApi = {
  list: (): Promise<OAuthClientResponse[]> => apiClient<OAuthClientResponse[]>('/oauth/clients'),

  detail: (clientId: string): Promise<OAuthClientResponse> =>
    apiClient<OAuthClientResponse>(`/oauth/clients/${clientId}`),

  rotateSecret: (clientId: string): Promise<{ clientSecret: string }> =>
    apiClient<{ clientSecret: string }>(`/oauth/clients/${clientId}/rotate-secret`, { method: 'POST' }),

  pause: (clientId: string): Promise<void> => apiClient<void>(`/oauth/clients/${clientId}/pause`, { method: 'POST' }),

  resume: (clientId: string): Promise<void> => apiClient<void>(`/oauth/clients/${clientId}/resume`, { method: 'POST' }),

  revoke: (clientId: string): Promise<void> => apiClient<void>(`/oauth/clients/${clientId}/revoke`, { method: 'POST' }),

  updateScopes: (clientId: string, scopes: AgentScope[]): Promise<OAuthClientResponse> =>
    apiClient<OAuthClientResponse>(`/oauth/clients/${clientId}/scopes`, {
      method: 'PATCH',
      body: JSON.stringify({ scopes }),
    }),
};
