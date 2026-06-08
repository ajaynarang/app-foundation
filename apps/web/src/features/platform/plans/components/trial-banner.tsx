'use client';

import { AlertTriangle, Clock, ShieldOff } from 'lucide-react';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { Button } from '@sally/ui/components/ui/button';
import { mailto } from '@/shared/lib/contacts';
import { usePlan } from '../hooks/use-plan';
import { useUpgradeUrl } from '../hooks/use-upgrade-url';

/**
 * Shows trial/plan status banners:
 * - TRIAL_EXPIRED: full-screen blocker — user cannot access anything
 * - SUSPENDED: full-screen blocker — user cannot access anything
 * - TRIAL (≤7 days left): yellow warning banner above content
 */
export function TrialBanner() {
  const { isOnTrial, daysLeftInTrial } = usePlan();
  const { upgradeUrl, canManageBilling } = useUpgradeUrl();

  // Active trial with 7 or fewer days remaining — yellow warning banner
  if (isOnTrial && daysLeftInTrial !== null && daysLeftInTrial <= 7) {
    const daysText =
      daysLeftInTrial === 0 ? 'today' : daysLeftInTrial === 1 ? 'in 1 day' : `in ${daysLeftInTrial} days`;

    return (
      <Alert className="rounded-none border-x-0 border-t-0 border-b border-caution/20 bg-caution/10">
        <Clock className="h-4 w-4 text-caution" />
        <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-caution font-medium">
            Your trial expires {daysText}.{' '}
            {canManageBilling ? 'Upgrade to keep full access.' : 'Ask your admin to upgrade.'}
          </span>
          {canManageBilling && (
            <a href={upgradeUrl} className="shrink-0">
              <Button size="sm" className="bg-caution text-white hover:bg-caution/90">
                Upgrade Now
              </Button>
            </a>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

/**
 * Full-screen blocker for TRIAL_EXPIRED and SUSPENDED states.
 * Replaces the entire main content area — user cannot navigate.
 */
export function PlanBlockedScreen() {
  const { plan, isTrialExpired, daysLeftInTrial: _daysLeftInTrial } = usePlan();
  const { upgradeUrl, isPaymentMode, canManageBilling } = useUpgradeUrl();

  const isSuspended = plan === 'SUSPENDED';

  if (!isTrialExpired && !isSuspended) return null;

  return (
    <div className="flex-1 flex items-center justify-center bg-background px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-critical/10 flex items-center justify-center">
          {isSuspended ? (
            <ShieldOff className="h-8 w-8 text-critical" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-critical" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-foreground">
          {isSuspended ? 'Account Suspended' : 'Your Trial Has Ended'}
        </h1>

        {/* Description */}
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {isSuspended
            ? 'Your account has been suspended. Please contact support to resolve this issue.'
            : canManageBilling
              ? 'Your 30-day free trial has expired. Upgrade to a paid plan to continue using SALLY and keep all your data.'
              : 'Your 30-day free trial has expired. Ask your account admin to upgrade to continue using SALLY.'}
        </p>

        {/* Your data is safe */}
        {isTrialExpired && (
          <p className="text-xs text-muted-foreground">Your data is safe — it will be available once you upgrade.</p>
        )}

        {/* CTAs — only show upgrade actions to ADMIN/OWNER */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {isTrialExpired && canManageBilling && (
            <a href={isPaymentMode ? upgradeUrl : '/pricing'}>
              <Button>{isPaymentMode ? 'Upgrade Now' : 'View Plans & Pricing'}</Button>
            </a>
          )}
          <a href={mailto(isSuspended ? 'support' : 'sally')}>
            <Button variant={isTrialExpired && canManageBilling ? 'outline' : 'default'}>
              {isSuspended ? 'Contact Support' : canManageBilling ? 'Contact Sales' : 'Contact Support'}
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
