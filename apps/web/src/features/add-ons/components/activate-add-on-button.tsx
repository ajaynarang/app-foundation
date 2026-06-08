'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@sally/ui/components/ui/button';
import { showSuccess, showError } from '@sally/ui';
import { addOnsApi } from '../api';
import { ADD_ONS_QUERY_KEYS } from '../hooks';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags/hooks/use-feature-flags';
import { useBillingOverview } from '@/features/billing/hooks/use-billing';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface ActivateAddOnButtonProps {
  slug: string;
  name: string;
  /** Whether the add-on has a providerPriceId configured */
  hasProviderPrice: boolean;
  /** Optional size variant */
  size?: 'sm' | 'default';
  /** Optional full width */
  className?: string;
  /** Override the button label (e.g. "Reactivate" for cancelled add-ons) */
  label?: string;
}

/**
 * Shared add-on activation button used on both the Subscription page and Add-ons page.
 *
 * Handles all scenarios:
 * - Trial tenant → "Try Free" (gifted at $0, no Stripe)
 * - Paid + subscription + price → "Activate" (Stripe subscription item)
 * - Admin-provisioned plan (no Stripe) → "Activate" (direct activation)
 * - Paid + no subscription + has price → "Request" (manual queue)
 * - No price configured → "Request" (manual queue)
 * - payment_system OFF → "Activate" (admin-provisioned mode)
 */
export function ActivateAddOnButton({
  slug,
  name,
  hasProviderPrice,
  size = 'sm',
  className,
  label,
}: ActivateAddOnButtonProps) {
  const queryClient = useQueryClient();
  const { isOnTrial } = usePlan();
  const { data: paymentEnabled } = useFeatureFlagEnabled('payment_system');
  const { data: billingOverview } = useBillingOverview();

  const isBillingEnabled = paymentEnabled === true;
  const subscription = billingOverview?.subscription;
  const hasActiveSubscription = subscription?.status === 'ACTIVE' || subscription?.status === 'TRIALING';

  // Decision logic
  const isTrialActivation = isOnTrial;
  const canSelfServe = !isOnTrial && isBillingEnabled && hasProviderPrice && hasActiveSubscription;
  // When plan is admin-assigned (no Stripe subscription), allow direct activation
  const isAdminProvisioned = !isOnTrial && !hasActiveSubscription && (!isBillingEnabled || !hasProviderPrice);

  const { mutate: activate, isPending } = useMutation({
    mutationFn: () =>
      canSelfServe || isTrialActivation || isAdminProvisioned
        ? addOnsApi.activateAddOn(slug)
        : addOnsApi.requestAddOn(slug),
    onSuccess: () => {
      showSuccess(
        isTrialActivation
          ? `${name} activated — free during your trial.`
          : canSelfServe || isAdminProvisioned
            ? `${name} activated successfully.`
            : `${name} request submitted. An admin will review it.`,
      );
      queryClient.invalidateQueries({ queryKey: ADD_ONS_QUERY_KEYS.myAddOns });
      queryClient.invalidateQueries({ queryKey: ADD_ONS_QUERY_KEYS.catalog });
    },
    onError: (error: Error) => showError('Failed to activate', extractErrorMessage(error)),
  });

  return (
    <Button variant="outline" size={size} loading={isPending} onClick={() => activate()} className={className}>
      {label ?? (isTrialActivation ? 'Try Free' : canSelfServe || isAdminProvisioned ? 'Activate' : 'Request')}
    </Button>
  );
}
