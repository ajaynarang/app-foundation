import { api } from '../../lib/api-client';

export interface ApiKey {
  id: string;
  key?: string;
  name: string;
  requestCount: number;
  lastUsedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface CreateApiKeyRequest {
  name: string;
}

export async function createApiKey(data: CreateApiKeyRequest): Promise<ApiKey> {
  return api.post<ApiKey>('/api-keys', data);
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return api.get<ApiKey[]>('/api-keys');
}

export async function revokeApiKey(id: string): Promise<void> {
  return api.delete<void>(`/api-keys/${id}`);
}
