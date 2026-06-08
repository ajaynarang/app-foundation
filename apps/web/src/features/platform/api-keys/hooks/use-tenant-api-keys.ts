import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AgentScope } from '@app/shared-types';
import { showSuccess, showError } from '@app/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { apiKeysApi, type TenantApiKeyListItem } from '../api';

/** Tenant-wide list (admin view). */
export function useTenantApiKeys() {
  return useQuery<TenantApiKeyListItem[]>({
    queryKey: queryKeys.apiKeys.list(),
    queryFn: apiKeysApi.listTenant,
  });
}

export function useRotateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiKeysApi.rotate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess("API key rotated — copy the new secret now, it won't be shown again");
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't rotate the key"),
  });
}

export function usePauseApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiKeysApi.pause(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess('API key paused');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't pause the key"),
  });
}

export function useResumeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiKeysApi.resume(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess('API key resumed');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't resume the key"),
  });
}

export function useRevokeApiKeyAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiKeysApi.revoke(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess('API key revoked');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't revoke the key"),
  });
}

interface UpdateScopesVars {
  id: number;
  scopes: AgentScope[];
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
}

export function useUpdateApiKeyScopes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateScopesVars) => apiKeysApi.updateScopes(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess('Scopes updated');
    },
    onError: (err: Error) => showError(extractErrorMessage(err) || "Couldn't update scopes"),
  });
}
