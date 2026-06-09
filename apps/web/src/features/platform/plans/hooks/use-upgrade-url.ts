'use client';

import { useFeatureFlagEnabled } from '@/features/platform/feature-flags';
import { useAuth } from '@/features/auth';
import { mailto } from '@/shared/lib/contacts';

/**
 * Returns the correct upgrade URL based on the payment_system feature flag,
 * and whether the current user has billing management rights.
 *
 * When payment_system is ON: links to the self-service subscription page.
 * When payment_system is OFF: links to a mailto (manual/sales-led flow).
 *
 * Only ADMIN and OWNER can manage billing. Other members see a
 * "Contact your admin" message instead of upgrade CTAs.
 */
export function useUpgradeUrl() {
  const { data: isPaymentEnabled } = useFeatureFlagEnabled('payment_system');
  const { isAdmin, isOwner } = useAuth();

  const canManageBilling = isAdmin || isOwner;

  const upgradeUrl = isPaymentEnabled ? '/settings/subscription' : mailto('app');

  const isPaymentMode = !!isPaymentEnabled;

  return { upgradeUrl, isPaymentMode, canManageBilling };
}
