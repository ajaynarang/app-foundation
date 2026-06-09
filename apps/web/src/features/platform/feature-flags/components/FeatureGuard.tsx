'use client';

import { ReactNode } from 'react';
import { useFeatureFlagEnabled, useFeatureFlag } from '@/features/platform/feature-flags';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { AssistantUpgradePrompt } from '@/features/platform/plans/components/assistant-upgrade-prompt';
import { ComingSoonBanner } from './ComingSoonBanner';
import { comingSoonContent } from '@/shared/config/comingSoonContent';
import { Skeleton } from '@app/ui/components/ui/skeleton';

export interface FeatureGuardProps {
  featureKey: string; // Feature flag key (kill-switch)
  entitlementKey?: string; // Plan entitlement key (defaults to featureKey)
  children: ReactNode;
  loadingFallback?: ReactNode;
}

/**
 * Component that conditionally renders children based on feature flag AND entitlement status.
 *
 * - Flag OFF → ComingSoonBanner (maintenance / not-yet-launched)
 * - Flag ON + not entitled → AssistantUpgradePrompt
 * - Flag ON + entitled → children
 * - Error → fail open (show children)
 */
export function FeatureGuard({ featureKey, entitlementKey, children, loadingFallback }: FeatureGuardProps) {
  const { data: isEnabled, isLoading: flagLoading, error } = useFeatureFlagEnabled(featureKey);
  const { data: flag } = useFeatureFlag(featureKey);
  const { hasFeature, isLoading: planLoading } = usePlan();

  const isLoading = flagLoading || planLoading;
  const effectiveEntitlementKey = entitlementKey ?? featureKey;

  if (isLoading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  if (error) {
    // eslint-disable-next-line no-console
    console.error(`Feature flag error for '${featureKey}':`, error);
    return <>{children}</>;
  }

  // Flag OFF → Coming Soon (maintenance/not-yet-launched)
  if (!isEnabled) {
    const content = comingSoonContent[featureKey];
    return (
      <ComingSoonBanner
        title={content?.title ?? flag?.name ?? 'Coming Soon'}
        description={content?.description ?? flag?.description ?? 'This feature is currently under development.'}
        features={content?.features}
        category={flag?.category}
      />
    );
  }

  // Flag ON but not entitled / no active add-on → Assistant Upgrade Prompt
  if (!hasFeature(effectiveEntitlementKey)) {
    return <AssistantUpgradePrompt feature={effectiveEntitlementKey} />;
  }

  return <>{children}</>;
}

export default FeatureGuard;
