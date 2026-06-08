import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentScope } from '@app/shared-types';
import { showSuccess, showError } from '@app/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { oauthClientsApi } from '../api';

/** Tenant-admin list of OAuth clients. Mirrors useOAuthClients but keyed to the tenant-admin list key. */
export function useTenantOAuthClients() {
  return useQuery({
    queryKey: queryKeys.oauthClients.list(),
    queryFn: oauthClientsApi.list,
  });
}

export function useOAuthClientDetail(clientId: string | null) {
  return useQuery({
    queryKey: ['oauth-clients', 'detail', clientId ?? ''] as const,
    queryFn: () => oauthClientsApi.detail(clientId as string),
    enabled: !!clientId,
  });
}

export function useRotateOAuthClientSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => oauthClientsApi.rotateSecret(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthClients.root });
      showSuccess("OAuth secret rotated — copy the new secret now, it won't be shown again");
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't rotate the secret"),
  });
}

export function usePauseOAuthClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => oauthClientsApi.pause(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthClients.root });
      showSuccess('OAuth client paused');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't pause the client"),
  });
}

export function useResumeOAuthClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => oauthClientsApi.resume(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthClients.root });
      showSuccess('OAuth client resumed');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't resume the client"),
  });
}

export function useRevokeOAuthClientAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => oauthClientsApi.revoke(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthClients.root });
      showSuccess('OAuth client revoked');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't revoke the client"),
  });
}

interface UpdateScopesVars {
  clientId: string;
  scopes: AgentScope[];
}

export function useUpdateOAuthClientScopes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, scopes }: UpdateScopesVars) => oauthClientsApi.updateScopes(clientId, scopes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.oauthClients.root });
      showSuccess('Scopes updated');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't update scopes"),
  });
}
