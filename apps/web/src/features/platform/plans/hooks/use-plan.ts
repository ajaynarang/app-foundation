import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth';
import { plansApi } from '../api';
import { addOnsApi } from '@/features/add-ons/api';
import { featureFlagsApi } from '@/features/platform/feature-flags/api';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';
import type { TenantPlan } from '../types';
import { upgradeRegistry } from '../config/upgrade-registry';
import { isAddOnFeature } from '@sally/shared-types';

/**
 * Hook that returns the current tenant's plan details and feature-gating helpers.
 *
 * - Only fetches when the user is authenticated and not a SUPER_ADMIN.
 * - Returns optimistic `true` during loading so UI doesn't flash locked states.
 * - Unified `hasFeature` checks add-ons first, then plan entitlements.
 */
export function usePlan() {
  const { user, isAuthenticated } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // Drivers and customers don't have access to plan/add-on endpoints
  const isNonAdminRole = user?.role === 'DRIVER' || user?.role === 'CUSTOMER';
  const canFetchPlan = isAuthenticated && !isSuperAdmin && !isNonAdminRole;

  const { data: planDetails, isLoading } = useQuery({
    queryKey: queryKeys.plans.root,
    queryFn: () => plansApi.getMyPlan(),
    enabled: canFetchPlan,
    ...QUERY_TIERS.STATIC,
  });

  const { data: myAddOns } = useQuery({
    queryKey: queryKeys.addOns.myAddOns,
    queryFn: () => addOnsApi.listMyAddOns(),
    enabled: canFetchPlan,
    ...QUERY_TIERS.STATIC,
  });

  const { data: featureFlags } = useQuery({
    queryKey: queryKeys.featureFlags.root,
    queryFn: () => featureFlagsApi.list(),
    enabled: isAuthenticated,
    ...QUERY_TIERS.STATIC,
  });

  const plan: TenantPlan | undefined = planDetails?.plan;

  /**
   * Checks if the current tenant's plan includes a specific entitlement.
   * Returns true optimistically during loading to prevent UI flicker.
   */
  function hasEntitlement(entitlementKey: string): boolean {
    if (isLoading || isSuperAdmin) return true;
    // Blocked states return true so sidebar doesn't show sparkles —
    // the full-screen PlanBlockedScreen handles the actual gating
    if (plan === 'TRIAL_EXPIRED' || plan === 'SUSPENDED') return true;
    if (!planDetails?.planConfig?.entitlements) return true; // Optimistic — data not loaded yet

    const entitlement = planDetails.planConfig.entitlements.find(
      (e: { feature: string; enabled: boolean }) => e.feature === entitlementKey,
    );
    return entitlement?.enabled ?? false;
  }

  /** Check if tenant has an active add-on by slug or feature key */
  function hasAddOn(key: string): boolean {
    if (isLoading || isSuperAdmin) return true;
    if (!myAddOns) return false;
    return myAddOns.some((sub) => (sub.addOn.slug === key || sub.addOn.featureKey === key) && sub.status === 'ACTIVE');
  }

  /**
   * Check if a feature flag kill-switch is ON.
   * Returns true if flags haven't loaded yet (optimistic) or if the flag is enabled.
   */
  function isFlagEnabled(key: string): boolean {
    if (!featureFlags) return true; // Optimistic while loading
    const flag = featureFlags.find((f: { key: string; enabled: boolean }) => f.key === key);
    return flag?.enabled ?? true; // Unknown flags default to enabled
  }

  /**
   * Unified feature check — THE function everything should use.
   * Hierarchy: feature flag (kill-switch) → add-on/entitlement check.
   */
  function hasFeature(key: string): boolean {
    if (isLoading || isSuperAdmin) return true;
    // Feature flag kill-switch takes priority — if OFF, feature is disabled regardless
    if (!isFlagEnabled(key)) return false;
    if (isAddOnFeature(key)) return hasAddOn(key);
    return hasEntitlement(key);
  }

  /** Whether this plan is fully blocked (trial expired or suspended). */
  const isBlocked = plan === 'TRIAL_EXPIRED' || plan === 'SUSPENDED';

  /**
   * Returns the minimum plan display name required for an entitlement.
   * Used by upgrade prompts to show "Requires Fleet plan".
   */
  function getRequiredPlan(entitlementKey: string): string {
    return upgradeRegistry[entitlementKey]?.requiredPlan ?? 'Freight Force';
  }

  const isTrialExpired = plan === 'TRIAL_EXPIRED';
  const isOnTrial = plan === 'TRIAL';

  return {
    plan,
    displayName: planDetails?.planConfig?.displayName ?? null,
    planDetails,
    isLoading,
    hasFeature,
    hasEntitlement,
    hasAddOn,
    getRequiredPlan,
    isBlocked,
    isTrialExpired,
    isOnTrial,
    daysLeftInTrial: planDetails?.daysLeftInTrial ?? null,
    trialEndsAt: planDetails?.trialEndsAt ?? null,
    vehicleCount: planDetails?.vehicleCount ?? 0,
    fleetLimit: planDetails?.fleetLimit ?? null,
    fleetLimitWarning: planDetails?.fleetLimitWarning ?? false,
  };
}
