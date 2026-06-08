/**
 * AI Spend TanStack Query hooks (read-only, super-admin).
 *
 * Cost data doesn't move minute-to-minute, so all use the STATIC tier
 * (5-minute stale). The drill-in queries are gated by `enabled` so we don't
 * fetch a tenant's breakdown until its row is expanded.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@sally/ui';

import { queryKeys } from '@/shared/constants/query-keys';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { aiSpendApi } from './api';
import type { UpdateAiBudgetInput } from './types';

const INVOCATION_PAGE_SIZE = 50;

export function useAiSpendTenants(days: number) {
  return useQuery({
    queryKey: queryKeys.aiSpend.tenants(days),
    queryFn: () => aiSpendApi.tenants(days),
    ...QUERY_TIERS.STATIC,
  });
}

export function useAiSpendBySurface(tenantId: number | null, days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.aiSpend.bySurface(tenantId ?? 0, days),
    queryFn: () => aiSpendApi.bySurface(tenantId as number, days),
    enabled: enabled && tenantId != null,
    ...QUERY_TIERS.STATIC,
  });
}

export function useAiSpendInvocations(tenantId: number | null, surface: string | undefined, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.aiSpend.invocations(tenantId ?? 0, surface),
    queryFn: ({ pageParam }) =>
      aiSpendApi.invocations(tenantId as number, {
        surface,
        limit: INVOCATION_PAGE_SIZE,
        cursor: pageParam as string | undefined,
      }),
    enabled: enabled && tenantId != null,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...QUERY_TIERS.STATIC,
  });
}

export function useAiBudget(tenantId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.aiSpend.budget(tenantId ?? 0),
    queryFn: () => aiSpendApi.getBudget(tenantId as number),
    enabled: enabled && tenantId != null,
    ...QUERY_TIERS.STATIC,
  });
}

export function useAiCostVsQuota(tenantId: number | null, days: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.aiSpend.costVsQuota(tenantId ?? 0, days),
    queryFn: () => aiSpendApi.costVsQuota(tenantId as number, days),
    enabled: enabled && tenantId != null,
    ...QUERY_TIERS.STATIC,
  });
}

export function useUpdateAiBudget(tenantId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAiBudgetInput) => aiSpendApi.updateBudget(tenantId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSpend.budget(tenantId) });
      qc.invalidateQueries({ queryKey: queryKeys.aiSpend.root });
      showSuccess('Budget updated');
    },
    onError: (error: Error) => {
      showError('Failed to update budget', extractErrorMessage(error));
    },
  });
}
