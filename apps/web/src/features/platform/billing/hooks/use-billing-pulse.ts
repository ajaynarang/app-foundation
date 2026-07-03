import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../api';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { queryKeys } from '@appshore/web-core/shared/constants';

interface Tenant {
  tenantId: string;
  companyName: string;
  status: string;
  plan?: string;
  createdAt: string;
  rejectedAt?: string;
  suspendedAt?: string;
}

interface PlanConfig {
  id: string;
  plan: string;
  displayName: string;
  pricePerUnit: number | null;
}

export interface RevenueByPlan {
  planName: string;
  tenantCount: number;
  mrr: number;
  percentage: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export function useBillingPulse() {
  const tenantsQuery = useQuery({
    queryKey: queryKeys.admin.billingTenants,
    queryFn: () => billingApi.getTenants(),
    ...QUERY_TIERS.STATIC,
  });

  const plansQuery = useQuery({
    queryKey: queryKeys.admin.billingPlans,
    queryFn: () => billingApi.getPlans(),
    ...QUERY_TIERS.STATIC,
  });

  const tenantsData = tenantsQuery.data;
  const plansData = plansQuery.data;
  const tenants: Tenant[] = useMemo(() => tenantsData ?? [], [tenantsData]);
  const plans: PlanConfig[] = useMemo(() => plansData ?? [], [plansData]);

  const computed = useMemo(() => {
    // Build a price lookup: plan name -> pricePerUnit (cents)
    const priceLookup = new Map<string, { displayName: string; pricePerUnit: number }>();
    for (const plan of plans) {
      if (plan.pricePerUnit != null) {
        priceLookup.set(plan.plan, {
          displayName: plan.displayName,
          pricePerUnit: plan.pricePerUnit,
        });
      }
    }

    // Active tenants = APPROVED or ACTIVE status (some backends use one or the other)
    const activeTenants = tenants.filter((t) => t.status === 'ACTIVE' || t.status === 'APPROVED');

    // Revenue by plan
    const planRevMap = new Map<string, { tenantCount: number; mrr: number; displayName: string }>();
    for (const tenant of activeTenants) {
      const planKey = tenant.plan || 'UNKNOWN';
      const planInfo = priceLookup.get(planKey);
      const price = planInfo?.pricePerUnit ?? 0;
      const displayName = planInfo?.displayName ?? planKey;

      const existing = planRevMap.get(planKey);
      if (existing) {
        existing.tenantCount += 1;
        existing.mrr += price;
      } else {
        planRevMap.set(planKey, { tenantCount: 1, mrr: price, displayName });
      }
    }

    const totalMrr = Array.from(planRevMap.values()).reduce((sum, p) => sum + p.mrr, 0);

    const revenueByPlan: RevenueByPlan[] = Array.from(planRevMap.entries())
      .map(([, value]) => ({
        planName: value.displayName,
        tenantCount: value.tenantCount,
        mrr: value.mrr,
        percentage: totalMrr > 0 ? (value.mrr / totalMrr) * 100 : 0,
      }))
      .sort((a, b) => b.mrr - a.mrr);

    // Distinct plan count
    const distinctPlans = new Set(activeTenants.map((t) => t.plan).filter(Boolean)).size;

    // Status breakdown
    const statusMap = new Map<string, number>();
    for (const tenant of tenants) {
      const status = tenant.status || 'UNKNOWN';
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    }

    const totalTenants = tenants.length;
    const statusBreakdown: StatusBreakdown[] = Array.from(statusMap.entries())
      .map(([status, count]) => ({
        status,
        count,
        percentage: totalTenants > 0 ? (count / totalTenants) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Attention: suspended + recently rejected (within 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const suspendedCount = tenants.filter((t) => t.status === 'SUSPENDED').length;
    const recentlyRejected = tenants.filter(
      (t) => t.status === 'REJECTED' && t.rejectedAt && new Date(t.rejectedAt) >= thirtyDaysAgo,
    ).length;
    const attentionCount = suspendedCount + recentlyRejected;

    return {
      totalMrr,
      activeSubscriptions: activeTenants.length,
      distinctPlans,
      attentionCount,
      revenueByPlan,
      statusBreakdown,
    };
  }, [tenants, plans]);

  return {
    ...computed,
    isLoading: tenantsQuery.isLoading || plansQuery.isLoading,
    isError: tenantsQuery.isError || plansQuery.isError,
  };
}
