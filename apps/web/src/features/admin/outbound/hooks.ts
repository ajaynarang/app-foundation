/**
 * Outbound TanStack Query hooks (super-admin). The held-back list grows as the environment sends, with no event
 * behind it, so it reads on the OPERATIONAL tier (refetch on focus).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOutboundAllowEntryInput, OutboundSuppression } from '@app/shared-types';
import { showError, showSuccess } from '@app/ui';
import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { useCursorList } from '@appshore/web-core/shared/list';
import { outboundApi } from './api';

export function useOutboundStatus() {
  return useQuery({ queryKey: queryKeys.outbound.status, queryFn: () => outboundApi.status(), ...QUERY_TIERS.STATIC });
}

export function useOutboundAllowList({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.outbound.allowList,
    queryFn: () => outboundApi.listEntries(),
    enabled,
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useOutboundHeldBack({ enabled = true } = {}) {
  return useCursorList<OutboundSuppression>({
    queryKey: queryKeys.outbound.heldBack,
    queryFn: (cursor) => outboundApi.listHeldBack(cursor),
    enabled,
    tier: QUERY_TIERS.OPERATIONAL,
  });
}

export function useAddOutboundAllowEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOutboundAllowEntryInput) => outboundApi.createEntry(input),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outbound.allowList });
      showSuccess(`${entry.value} can now receive messages`);
    },
    onError: (err: Error) => showError('Could not add to the allow-list', extractErrorMessage(err)),
  });
}

export function useRemoveOutboundAllowEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => outboundApi.deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.outbound.allowList });
      showSuccess('Removed from the allow-list');
    },
    onError: (err: Error) => showError('Could not remove from the allow-list', extractErrorMessage(err)),
  });
}
