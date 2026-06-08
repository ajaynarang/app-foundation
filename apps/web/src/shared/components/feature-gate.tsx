'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { upgradeRegistry } from '@/features/platform/plans/config/upgrade-registry';
import { apiClient } from '@/shared/lib/api';
import { showSuccess, showError } from '@/shared/lib/toast';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------------------------------------------------------------------------
// Default benefit bullets per category (fallback)
// ---------------------------------------------------------------------------
const DEFAULT_BENEFITS = [
  'Streamline your daily operations',
  'Get actionable insights and analytics',
  'Reduce manual work with automation',
];

// ---------------------------------------------------------------------------
// Feature Gate
// ---------------------------------------------------------------------------
interface FeatureGateProps {
  featureKey: string;
  children: React.ReactNode;
  /** Optional override for the upsell icon (emoji) */
  icon?: string;
  /** Optional override for the feature display name */
  name?: string;
  /** Optional override for the feature description */
  description?: string;
  /** Optional override for the benefit bullet points */
  benefits?: string[];
}

export function FeatureGate({ featureKey, children, icon, name, description, benefits }: FeatureGateProps) {
  const { hasFeature, isLoading } = usePlan();
  const [requested, setRequested] = useState(false);

  // Get display info from upgrade registry (no API call needed)
  const registryEntry = upgradeRegistry[featureKey];

  const { mutate: requestAddOn, isPending } = useMutation({
    mutationFn: () =>
      apiClient(`/add-ons/${registryEntry?.addOnSlug ?? featureKey}/request`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      setRequested(true);
      showSuccess('Request sent! The SALLY team will review and activate it for you.');
    },
    onError: (error: Error) => {
      showError('Could not send request', extractErrorMessage(error));
    },
  });

  // While loading, show a skeleton placeholder
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Skeleton className="h-64 w-full max-w-lg rounded-xl" />
      </div>
    );
  }

  // Feature is enabled — render children
  if (hasFeature(featureKey)) {
    return <>{children}</>;
  }

  // Feature is not enabled — show upsell card
  const displayIcon = icon ?? '🔒';
  const displayName = name ?? registryEntry?.displayName ?? featureKey;
  const displayDescription = description ?? registryEntry?.description ?? 'This feature requires an add-on to unlock.';
  const displayBenefits = benefits ?? registryEntry?.benefits ?? DEFAULT_BENEFITS;
  const priceLabel = registryEntry?.addOnPrice ?? null;

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div className="max-w-md w-full text-center space-y-5">
        {/* Icon */}
        <div className="text-[40px] leading-none">{displayIcon}</div>

        {/* Name */}
        <h3 className="text-lg font-bold text-foreground">{displayName}</h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{displayDescription}</p>

        {/* Benefits */}
        <ul className="text-sm text-left inline-block space-y-2">
          {displayBenefits.map((benefit, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-violet-400 mt-0.5 shrink-0">&#10003;</span>
              <span className="text-muted-foreground">{benefit}</span>
            </li>
          ))}
        </ul>

        {/* Price */}
        {priceLabel && <div className="text-violet-400 font-bold text-2xl">{priceLabel}</div>}

        {/* CTA */}
        {requested ? (
          <p className="text-sm text-muted-foreground">Your request has been submitted. We will review it shortly.</p>
        ) : (
          <div>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => requestAddOn()}
              loading={isPending}
            >
              Request from SALLY
            </Button>
          </div>
        )}

        {/* Support hint */}
        <p className="text-xs text-muted-foreground">
          Our team will review your request and activate it for you.
          <br />
          Usually within 24 hours. Questions? support@appshore.in
        </p>
      </div>
    </div>
  );
}
