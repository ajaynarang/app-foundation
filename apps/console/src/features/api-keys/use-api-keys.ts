import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listApiKeys, createApiKey, revokeApiKey, type CreateApiKeyRequest, type ApiKey } from './api';
import { showSuccess, showError } from '@app/ui';

const API_KEYS_KEY = ['api-keys'] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_KEY,
    queryFn: listApiKeys,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
      showSuccess('API key created');
    },
    onError: (err: Error) => {
      showError('Failed to create API key', err.message);
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
      showSuccess('API key revoked');
    },
    onError: (err: Error) => {
      showError('Failed to revoke API key', err.message);
    },
  });
}

export type { ApiKey };
