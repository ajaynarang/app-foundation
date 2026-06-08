import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../lib/auth-store';
import { plansApi } from './api';
import { addOnsApi } from '../add-ons/api';
import { QUERY_TIERS } from '../../shared/config/query-tiers';
import type { TenantPlan } from '@app/shared-types';
import { isAddOnFeature } from '@app/shared-types';

const PLAN_QUERY_KEY = ['my-plan'] as const;
const MY_ADD_ONS_QUERY_KEY = ['add-ons', 'my-add-ons'] as const;

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

  const { data: myAddOns } = useQuery({
    queryKey: MY_ADD_ONS_QUERY_KEY,
    queryFn: () => addOnsApi.listMyAddOns(),
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

  /** Check if tenant has an active add-on by slug or feature key */
  function hasAddOn(slug: string): boolean {
    if (isSuperAdmin) return true;
    if (!myAddOns) return false;
    return myAddOns.some(
      (sub) => (sub.addOn.slug === slug || sub.addOn.featureKey === slug) && sub.status === 'ACTIVE',
    );
  }

  /** Unified feature check — routes to add-on or entitlement based on feature type */
  function hasFeature(key: string): boolean {
    if (isLoading || isSuperAdmin) return true;
    if (isAddOnFeature(key)) return hasAddOn(key);
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
    hasAddOn,
    isBlocked,
    isTrialExpired,
    isOnTrial,
    daysLeftInTrial: planDetails?.daysLeftInTrial ?? null,
    vehicleCount: planDetails?.vehicleCount ?? 0,
    fleetLimit: planDetails?.fleetLimit ?? null,
    fleetLimitWarning: planDetails?.fleetLimitWarning ?? false,
  };
}
