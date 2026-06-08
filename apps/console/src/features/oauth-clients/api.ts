import { apiClient } from '../../lib/api-client';
import type { OAuthClientResponse, OAuthClientCreatedResponse, CreateOAuthClientInput } from '@app/shared-types';

export type { OAuthClientResponse, OAuthClientCreatedResponse };

export async function listOAuthClients(): Promise<OAuthClientResponse[]> {
  return apiClient<OAuthClientResponse[]>('/oauth/clients');
}

export async function createOAuthClient(input: CreateOAuthClientInput): Promise<OAuthClientCreatedResponse> {
  return apiClient<OAuthClientCreatedResponse>('/oauth/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revokeOAuthClient(clientId: string): Promise<void> {
  await apiClient(`/oauth/clients/${clientId}`, { method: 'DELETE' });
}
