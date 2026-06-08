import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createOAuthClient } from '../api';
import type { CreateOAuthClientInput } from '@sally/shared-types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

/**
 * Create a new OAuth client. Used by {@link OAuthClientRegisterSheet} to
 * register an app/agent that will call SALLY APIs on behalf of a user. The
 * list/revoke flow for tenant admins lives in `use-tenant-oauth-clients.ts`.
 */
export function useCreateOAuthClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOAuthClientInput) => createOAuthClient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.oauthClients.root });
      showSuccess('OAuth client created');
    },
    onError: (err: Error) => {
      showError(extractErrorMessage(err) || 'Failed to create OAuth client');
    },
  });
}
