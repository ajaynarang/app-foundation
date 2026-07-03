/**
 * AI Spend API client — read-only, super-admin scoped.
 *
 * Mirrors the backend `admin/ai-spend` controller. The invocation list is
 * cursor-paginated; pass `cursor` from the previous page's `nextCursor`.
 */
import { apiClient } from '@appshore/web-core/shared/lib/api';
import type {
  AiSpendTenantSummary,
  AiSpendSurfaceRow,
  AiSpendInvocationList,
  AiBudget,
  AiCostVsQuota,
  UpdateAiBudgetInput,
} from './types';

function toQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.append(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const aiSpendApi = {
  tenants: (days: number) => apiClient<AiSpendTenantSummary[]>(`/admin/ai-spend/tenants${toQuery({ days })}`),

  bySurface: (tenantId: number, days: number) =>
    apiClient<AiSpendSurfaceRow[]>(`/admin/ai-spend/tenants/${tenantId}/by-surface${toQuery({ days })}`),

  invocations: (tenantId: number, params: { surface?: string; limit?: number; cursor?: string }) =>
    apiClient<AiSpendInvocationList>(
      `/admin/ai-spend/tenants/${tenantId}/invocations${toQuery(params as Record<string, unknown>)}`,
    ),

  getBudget: (tenantId: number) => apiClient<AiBudget>(`/admin/ai-spend/tenants/${tenantId}/budget`),

  updateBudget: (tenantId: number, body: UpdateAiBudgetInput) =>
    apiClient<AiBudget>(`/admin/ai-spend/tenants/${tenantId}/budget`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  costVsQuota: (tenantId: number, days: number) =>
    apiClient<AiCostVsQuota>(`/admin/ai-spend/tenants/${tenantId}/cost-vs-quota${toQuery({ days })}`),
};
