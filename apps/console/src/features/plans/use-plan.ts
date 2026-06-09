import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../lib/auth-store';
import { plansApi } from './api';
import { QUERY_TIERS } from '../../shared/config/query-tiers';
import type { TenantPlan } from '@app/shared-types';

const PLAN_QUERY_KEY = ['my-plan'] as const;

export function usePlan() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data: planDetails, isLoading } = useQuery({
    queryKey: PLAN_QUERY_KEY,
    queryFn: () => plansApi.getMyPlan(),
    enabled: isAuthenticated && !isSuperAdmin,
    ...QUERY_TIERS.STATIC,
  });

  const plan: TenantPlan | undefined = planDetails?.plan;

  function hasEntitlement(entitlementKey: string): boolean {
    if (isLoading || isSuperAdmin) return true;
    // Blocked states return true so sidebar doesn't show sparkles —
    // the full-screen blocker handles the actual gating
    if (plan === 'TRIAL_EXPIRED' || plan === 'SUSPENDED') return true;
    if (!planDetails?.planConfig?.entitlements) return true;

    const entitlement = planDetails.planConfig.entitlements.find(
      (e: { feature: string; enabled: boolean }) => e.feature === entitlementKey,
    );
    return entitlement?.enabled ?? false;
  }

  /** Unified feature check based on plan entitlements */
  function hasFeature(key: string): boolean {
    if (isLoading || isSuperAdmin) return true;
    return hasEntitlement(key);
  }

  const isTrialExpired = plan === 'TRIAL_EXPIRED';
  const isOnTrial = plan === 'TRIAL';
  const isBlocked = plan === 'TRIAL_EXPIRED' || plan === 'SUSPENDED';

  return {
    plan,
    displayName: planDetails?.planConfig?.displayName ?? null,
    planDetails,
    isLoading,
    hasFeature,
    hasEntitlement,
    isBlocked,
    isTrialExpired,
    isOnTrial,
    daysLeftInTrial: planDetails?.daysLeftInTrial ?? null,
  };
}
