/**
 * AI Spend TanStack Query hooks (read-only, super-admin).
 *
 * Cost data doesn't move minute-to-minute, so all use the STATIC tier
 * (5-minute stale). The drill-in queries are gated by `enabled` so we don't
 * fetch a tenant's breakdown until its row is expanded.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showSuccess, showError } from '@app/ui';

import { queryKeys } from '@appshore/web-core/shared/constants/query-keys';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { useCursorList } from '@appshore/web-core/shared/list';
import { aiSpendApi } from './api';
import type { UpdateAiBudgetInput } from './types';

/** The tenants that spent in the window, highest spend first: a cursor list ("Load more"). */
export function useAiSpendTenants(days: number) {
  return useCursorList({
    queryKey: queryKeys.aiSpend.tenants(days),
    queryFn: (cursor) => aiSpendApi.tenants({ days, cursor }),
    tier: QUERY_TIERS.STATIC,
  });
}

/** The window total across every tenant: from the server, so it never depends on the pages loaded. */
export function useAiSpendSummary(days: number) {
  return useQuery({
    queryKey: queryKeys.aiSpend.summary(days),
    queryFn: () => aiSpendApi.summary(days),
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

/** One tenant's invocations, newest first: a cursor list ("Load more"). */
export function useAiSpendInvocations(tenantId: number | null, surface: string | undefined, enabled: boolean) {
  return useCursorList({
    queryKey: queryKeys.aiSpend.invocations(tenantId ?? 0, surface),
    queryFn: (cursor) => aiSpendApi.invocations(tenantId as number, { surface, cursor }),
    enabled: enabled && tenantId != null,
    tier: QUERY_TIERS.STATIC,
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
