import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listOAuthClients, createOAuthClient, revokeOAuthClient } from './api';
import type { CreateOAuthClientInput } from '@sally/shared-types';
import { showSuccess, showError } from '@sally/ui';

const OAUTH_CLIENTS_KEY = ['oauth-clients'] as const;

export function useOAuthClients() {
  return useQuery({
    queryKey: OAUTH_CLIENTS_KEY,
    queryFn: listOAuthClients,
  });
}

export function useCreateOAuthClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOAuthClientInput) => createOAuthClient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OAUTH_CLIENTS_KEY });
      showSuccess('OAuth client created');
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to create OAuth client');
    },
  });
}

export function useRevokeOAuthClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (clientId: string) => revokeOAuthClient(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: OAUTH_CLIENTS_KEY });
      showSuccess('OAuth client revoked');
    },
    onError: (err: Error) => {
      showError(err.message || 'Failed to revoke OAuth client');
    },
  });
}
