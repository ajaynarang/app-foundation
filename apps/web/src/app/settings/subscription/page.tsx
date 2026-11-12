'use client';

import { useState, useMemo } from 'react';
import { Check, Lock, AlertTriangle, Sparkles, Crown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Progress } from '@app/ui/components/ui/progress';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@app/ui/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@app/ui/components/ui/sheet';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { plansApi } from '@/features/platform/plans/api';
import {
  useBillingOverview,
  useCancelSubscription,
  useReactivateSubscription,
  useCreateCheckout,
  useUpgradePlan,
  useDowngradePlan,
} from '@/features/billing/hooks/use-billing';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags/hooks/use-feature-flags';
import { formatCents } from '@appshore/web-core/shared/lib/utils/formatters';
import { useQuery } from '@tanstack/react-query';
import type { PlanConfig, TenantPlan } from '@app/shared-types';
import { cn } from '@app/ui';
import { mailto } from '@appshore/web-core/shared/lib/contacts';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { PageHeader, PageLoadingSkeleton, PageSection } from '@/shared/components/page-chrome';
import { SUBSCRIPTION_STATUS_VARIANTS, TENANT_PLAN_VARIANTS, variantOf } from '@/features/billing/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SUBSCRIBABLE_PLANS: TenantPlan[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const PLAN_ORDER: Record<string, number> = {
  TRIAL: 0,
  TRIAL_EXPIRED: 0,
  SUSPENDED: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

function getPlanAction(
  currentPlan: string | undefined,
  targetPlan: string,
  hasActiveSubscription: boolean,
): 'current' | 'upgrade' | 'downgrade' | 'subscribe' {
  if (!currentPlan || currentPlan === 'TRIAL' || currentPlan === 'TRIAL_EXPIRED' || currentPlan === 'SUSPENDED')
    return 'subscribe';
  if (!hasActiveSubscription) return 'subscribe';
  if (currentPlan === targetPlan) return 'current';
  const currentOrder = PLAN_ORDER[currentPlan] ?? 0;
  const targetOrder = PLAN_ORDER[targetPlan] ?? 0;
  return targetOrder > currentOrder ? 'upgrade' : 'downgrade';
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
const SUBSCRIPTION_HEADER = <PageHeader title="Subscription" subtitle="Your plan, your way" />;

function SubscriptionSkeleton() {
  return (
    <div className="space-y-6">
      {SUBSCRIPTION_HEADER}
      <PageLoadingSkeleton variant="cards" rows={3} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan Selector Sheet
// ---------------------------------------------------------------------------
function PlanSelectorSheet({
  open,
  onOpenChange,
  currentPlan,
  seatCount,
  isBillingEnabled,
  isTrialUser,
  hasActiveSubscription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan?: TenantPlan;
  seatCount: number;
  isBillingEnabled: boolean;
  isTrialUser: boolean;
  hasActiveSubscription: boolean;
}) {
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansApi.getPlans(),
    enabled: open,
  });

  const [selectedPlan, setSelectedPlan] = useState<PlanConfig | null>(null);
  const [seatQuantity, setSeatQuantity] = useState<number>(seatCount || 1);

  const { mutate: startCheckout, isPending: checkoutPending } = useCreateCheckout();
  const { mutate: upgradePlan, isPending: upgradePending } = useUpgradePlan();
  const { mutate: downgradePlan, isPending: downgradePending } = useDowngradePlan();

  const actionPending = checkoutPending || upgradePending || downgradePending;

  // Filter to only subscribable plans, sorted by displayOrder
  const subscribablePlans = useMemo(
    () =>
      (plans ?? []).filter((p) => SUBSCRIBABLE_PLANS.includes(p.plan)).sort((a, b) => a.displayOrder - b.displayOrder),
    [plans],
  );

  // Reset selection when sheet opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setSelectedPlan(null);
      setSeatQuantity(seatCount || 1);
    }
    onOpenChange(next);
  };

  const canSelfServePlan = !!selectedPlan?.providerPriceId;
  const isEnterprise = selectedPlan?.plan === 'ENTERPRISE';
  const totalCents = selectedPlan?.pricePerUnitCents != null ? selectedPlan.pricePerUnitCents * seatQuantity : null;

  const handlePlanAction = () => {
    if (!selectedPlan) return;
    const action = getPlanAction(currentPlan, selectedPlan.plan, hasActiveSubscription);

    if (action === 'subscribe') {
      // New subscription — redirect to Stripe Checkout
      startCheckout({
        plan: selectedPlan.plan,
        quantity: seatQuantity,
        successUrl: `${window.location.origin}/settings/subscription?checkout=success`,
        cancelUrl: `${window.location.origin}/settings/subscription?checkout=cancel`,
      });
    } else if (action === 'upgrade') {
      // Existing subscriber upgrading — use upgrade endpoint
      upgradePlan(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { newPlan: selectedPlan.plan as any, newQuantity: seatQuantity },
        { onSuccess: () => onOpenChange(false) },
      );
    } else if (action === 'downgrade') {
      // Existing subscriber downgrading — use downgrade endpoint
      downgradePlan(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { newPlan: selectedPlan.plan as any },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col h-full p-6"
        pinnable
        resizable
        defaultPinned
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>{isTrialUser ? 'Choose a Plan' : 'Change Plan'}</SheetTitle>
          <SheetDescription>Select a plan that fits your team.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto min-h-0 space-y-4">
          {plansLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {/* Plan cards */}
              {subscribablePlans.map((p) => {
                const action = getPlanAction(currentPlan, p.plan, hasActiveSubscription);
                const isCurrent = action === 'current';
                const isSelected = selectedPlan?.id === p.id;

                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => !isCurrent && setSelectedPlan(p)}
                    className={cn(
                      'w-full text-left rounded-lg border p-4 transition-colors',
                      isCurrent && 'border-border bg-muted/50 opacity-60 cursor-not-allowed',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : !isCurrent && 'border-border bg-card hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{p.displayName}</span>
                          {isCurrent && (
                            <Badge variant="outline" className="text-2xs">
                              Current Plan
                            </Badge>
                          )}
                          {action === 'upgrade' && !isSelected && <StatusBadge tone="success">Upgrade</StatusBadge>}
                          {action === 'downgrade' && !isSelected && <StatusBadge tone="warning">Downgrade</StatusBadge>}
                          {p.isPopular && !isCurrent && (
                            <Badge variant="default" className="text-2xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              Most Popular
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{p.tagline}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {p.pricePerUnitCents != null ? (
                          <div>
                            <span className="text-sm font-bold text-foreground">
                              {formatCents(p.pricePerUnitCents)}
                            </span>
                            <span className="text-xs text-muted-foreground">/{p.unitLabel}</span>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">Custom pricing</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {p.seatLimit != null && <span>Up to {p.seatLimit} seats</span>}
                      {p.seatLimit == null && <span>Unlimited seats</span>}
                      {p.userLimit != null && <span>{p.userLimit} users</span>}
                      {p.userLimit == null && <span>Unlimited users</span>}
                    </div>
                  </button>
                );
              })}

              {/* Seat count + summary — only shown for self-serve plans with Stripe prices */}
              {selectedPlan && canSelfServePlan && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="space-y-1.5">
                    <Label htmlFor="seat-count">Number of Seats</Label>
                    <Input
                      id="seat-count"
                      type="number"
                      min={1}
                      value={seatQuantity}
                      onChange={(e) => setSeatQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                  </div>
                  {totalCents != null && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {seatQuantity} seat{seatQuantity !== 1 ? 's' : ''} x{' '}
                        {formatCents(selectedPlan.pricePerUnitCents!)}/{selectedPlan.unitLabel}
                      </span>
                      <span className="font-semibold text-foreground">{formatCents(totalCents)}/mo</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 pt-4 flex-shrink-0 border-t border-border mt-4">
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {selectedPlan && (!canSelfServePlan || !isBillingEnabled) ? (
            <a href={mailto('app', isEnterprise ? 'Enterprise Plan Inquiry' : 'Plan Subscription')}>
              <Button>
                {isEnterprise && <Crown className="h-4 w-4 mr-1.5" />}
                Contact Sales
              </Button>
            </a>
          ) : selectedPlan && canSelfServePlan && isBillingEnabled ? (
            <Button onClick={handlePlanAction} loading={actionPending} disabled={!selectedPlan}>
              {(() => {
                const action = getPlanAction(currentPlan, selectedPlan.plan, hasActiveSubscription);
                if (action === 'upgrade') return 'Upgrade to ' + selectedPlan.displayName;
                if (action === 'downgrade') return 'Downgrade to ' + selectedPlan.displayName;
                return 'Subscribe to ' + selectedPlan.displayName;
              })()}
            </Button>
          ) : (
            <Button disabled>Select a Plan</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SubscriptionPage() {
  const { formatDate } = useFormatters();
  const {
    plan,
    displayName,
    planDetails,
    isLoading: planLoading,
    seatCount,
    seatLimit,
    seatLimitWarning,
    isTrialExpired,
    isOnTrial,
    daysLeftInTrial,
    trialEndsAt,
  } = usePlan();

  const { data: billingOverview, isLoading: billingLoading } = useBillingOverview();
  const { mutate: cancelSub, isPending: cancelPending } = useCancelSubscription();
  const { mutate: reactivate, isPending: reactivatePending } = useReactivateSubscription();
  const { data: billingEnabled, isSuccess: flagLoaded } = useFeatureFlagEnabled('payment_system');
  const isBillingEnabled = flagLoaded && billingEnabled === true;

  const [planSheetOpen, setPlanSheetOpen] = useState(false);

  const isLoading = planLoading || billingLoading;

  const usagePercent = seatLimit && seatLimit > 0 ? Math.min((seatCount / seatLimit) * 100, 100) : 0;

  const subscription = billingOverview?.subscription;
  const hasActiveSubscription =
    !!subscription && subscription.status !== 'CANCELED' && subscription.status !== 'SUSPENDED';

  const isTrialUser = !plan || plan === 'TRIAL' || plan === 'TRIAL_EXPIRED';

  if (isLoading) {
    return <SubscriptionSkeleton />;
  }

  return (
    <div className="space-y-8">
      {SUBSCRIPTION_HEADER}

      {/* Blocked banner */}
      {(isTrialExpired || plan === 'SUSPENDED') && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">
                  {isTrialExpired ? 'Trial Expired' : 'Account Suspended'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {isTrialExpired
                    ? 'Your trial has ended. Subscribe to a plan to continue.'
                    : 'Your account has been suspended due to payment issues. Please update your payment method.'}
                </p>
                <Button size="sm" className="mt-3" onClick={() => setPlanSheetOpen(true)}>
                  Choose a Plan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PageSection title="Current plan">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-foreground">{displayName ?? plan ?? 'Unknown'}</span>
                  {plan && (
                    <StatusBadge tone={variantOf(TENANT_PLAN_VARIANTS, plan).tone}>
                      {variantOf(TENANT_PLAN_VARIANTS, plan).label}
                    </StatusBadge>
                  )}
                  {subscription && (
                    <StatusBadge tone={variantOf(SUBSCRIPTION_STATUS_VARIANTS, subscription.status).tone}>
                      {variantOf(SUBSCRIPTION_STATUS_VARIANTS, subscription.status).label}
                    </StatusBadge>
                  )}
                </div>

                {/* Price */}
                {planDetails?.planConfig?.pricePerUnitCents != null ? (
                  <p className="text-sm text-muted-foreground">
                    {formatCents(planDetails.planConfig.pricePerUnitCents)} / {planDetails.planConfig.unitLabel}
                    {subscription && (
                      <span className="ml-2">
                        · {subscription.quantity} seat
                        {subscription.quantity !== 1 ? 's' : ''} ={' '}
                        <span className="font-medium text-foreground">
                          {formatCents(subscription.unitPriceCents * subscription.quantity)}
                          /mo
                        </span>
                      </span>
                    )}
                  </p>
                ) : plan === 'ENTERPRISE' ? (
                  <p className="text-sm text-muted-foreground">Custom pricing</p>
                ) : null}

                {/* Trial countdown */}
                {isOnTrial && daysLeftInTrial !== null && (
                  <p className="text-sm text-muted-foreground">
                    {daysLeftInTrial === 0
                      ? 'Trial expires today'
                      : `${daysLeftInTrial} day${daysLeftInTrial !== 1 ? 's' : ''} left in trial`}
                    {trialEndsAt && <span className="text-xs ml-1">(ends {formatDate(trialEndsAt)})</span>}
                  </p>
                )}

                {/* Period */}
                {subscription && !isOnTrial && subscription.currentPeriodEnd && (
                  <p className="text-xs text-muted-foreground">
                    Current period ends {formatDate(subscription.currentPeriodEnd)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {subscription?.cancelAtPeriodEnd ? (
                  <Button size="sm" onClick={() => reactivate()} loading={reactivatePending}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(subscription as any).pendingDowngradePlan ? `Keep ${displayName}` : 'Reactivate'}
                  </Button>
                ) : plan !== 'ENTERPRISE' && plan !== 'SUSPENDED' ? (
                  <Button variant="outline" size="sm" onClick={() => setPlanSheetOpen(true)}>
                    {isTrialUser ? 'Subscribe' : 'Change Plan'}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Pending change notice */}
            {subscription?.cancelAtPeriodEnd && (
              <div className="rounded-md bg-caution/15 p-3 text-sm text-caution-text">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(subscription as any).pendingDowngradePlan ? (
                  <>
                    Your plan will change to{' '}
                    <span className="font-semibold">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(subscription as any).pendingDowngradePlan === 'STARTER' ? 'Starter' : 'Professional'}
                    </span>{' '}
                    at the end of the current billing period ({formatDate(subscription.currentPeriodEnd)}
                    ). Click &quot;Keep {displayName}&quot; to stay on your current plan.
                  </>
                ) : (
                  <>
                    Your subscription will cancel at the end of the current billing period (
                    {formatDate(subscription.currentPeriodEnd)}
                    ). Click &quot;Reactivate&quot; to keep your plan.
                  </>
                )}
              </div>
            )}

            {/* Subscription ended notice */}
            {plan === 'TRIAL_EXPIRED' && !hasActiveSubscription && (
              <div className="rounded-md border border-caution/50 bg-caution/10 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-caution-text" />
                  <p className="text-sm font-medium text-caution-text">Your subscription has ended</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Subscribe to a plan to restore access to your account features.
                </p>
                <Button size="sm" onClick={() => setPlanSheetOpen(true)}>
                  Choose a Plan
                </Button>
              </div>
            )}

            {/* Seat Usage */}
            {seatLimit !== null && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    Seat Usage
                    {seatLimitWarning && <AlertTriangle className="h-3.5 w-3.5 text-caution-text" />}
                  </span>
                  <span
                    className={seatLimitWarning ? 'font-semibold text-caution-text' : 'font-medium text-foreground'}
                  >
                    {seatCount} / {seatLimit} seats
                  </span>
                </div>
                <Progress value={usagePercent} className="h-2 bg-muted" />
                {seatLimitWarning && (
                  <p className="text-xs text-caution-text">Approaching seat limit. Contact sales to upgrade.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features checklist */}
        {planDetails?.planConfig?.entitlements && planDetails.planConfig.entitlements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Included Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {planDetails.planConfig.entitlements.map(
                  (e: { feature: string; enabled: boolean; displayName: string }) => (
                    <div key={e.feature} className="flex items-center gap-2 text-sm py-1">
                      {e.enabled ? (
                        <Check className="h-4 w-4 shrink-0 text-success-text" />
                      ) : (
                        <Lock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      )}
                      <span className={e.enabled ? 'text-foreground' : 'text-muted-foreground'}>{e.displayName}</span>
                    </div>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cancel subscription (only if active, not already canceling) */}
        {subscription && subscription.status === 'ACTIVE' && !subscription.cancelAtPeriodEnd && (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  Cancel Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your plan will remain active until the end of the current billing period. After that, your account
                    will be downgraded.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelSub(undefined)}
                    disabled={cancelPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Cancel
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </PageSection>

      {/* Plan Selector Sheet */}
      <PlanSelectorSheet
        open={planSheetOpen}
        onOpenChange={setPlanSheetOpen}
        currentPlan={plan}
        seatCount={seatCount}
        isBillingEnabled={isBillingEnabled}
        isTrialUser={isTrialUser}
        hasActiveSubscription={hasActiveSubscription}
      />
    </div>
  );
}
