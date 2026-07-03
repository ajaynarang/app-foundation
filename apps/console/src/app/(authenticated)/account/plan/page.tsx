'use client';

import { mailto } from '@/lib/contacts';
import { Check, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { usePlan } from '@/features/plans/use-plan';
import { useFormatters, DISPLAY_FORMATS } from '@/shared/lib/formatters';

// ---------------------------------------------------------------------------
// Plan badge variant helper
// ---------------------------------------------------------------------------
type BadgeVariant = 'destructive' | 'outline' | 'default' | 'muted';

function planBadgeVariant(plan?: string): BadgeVariant {
  if (!plan) return 'outline';
  if (plan === 'TRIAL_EXPIRED' || plan === 'SUSPENDED') return 'destructive';
  if (plan === 'TRIAL') return 'muted';
  return 'default';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function BillingPage() {
  const { formatTimestamp } = useFormatters();
  const { plan, displayName, planDetails, isLoading, isTrialExpired, isOnTrial, daysLeftInTrial } = usePlan();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Billing &amp; Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">Your current plan and usage details.</p>
        </div>
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Billing &amp; Plan</h2>
        <p className="text-sm text-muted-foreground mt-1">Your current plan and usage details.</p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-foreground">{displayName ?? plan ?? 'Unknown'}</span>
                <Badge variant={planBadgeVariant(plan)}>{plan ?? 'Unknown'}</Badge>
              </div>

              {/* Price */}
              {planDetails?.planConfig?.pricePerUnitCents != null ? (
                <p className="text-sm text-muted-foreground">
                  ${planDetails.planConfig.pricePerUnitCents} / {planDetails.planConfig.unitLabel}
                </p>
              ) : plan === 'ENTERPRISE' ? (
                <p className="text-sm text-muted-foreground">Custom pricing</p>
              ) : null}

              {/* Status context */}
              {isTrialExpired && (
                <p className="text-sm text-destructive font-medium">Trial has expired. Account is in read-only mode.</p>
              )}
              {isOnTrial && daysLeftInTrial !== null && (
                <p className="text-sm text-muted-foreground">
                  {daysLeftInTrial === 0
                    ? 'Trial expires today'
                    : `${daysLeftInTrial} day${daysLeftInTrial !== 1 ? 's' : ''} left in trial`}
                </p>
              )}
              {planDetails?.planAssignedAt && !isOnTrial && (
                <p className="text-sm text-muted-foreground">
                  Active since {formatTimestamp(planDetails.planAssignedAt, DISPLAY_FORMATS.FULL)}
                </p>
              )}
            </div>

            {plan !== 'ENTERPRISE' && plan !== 'SUSPENDED' && (
              <a href={mailto('sales')} className="shrink-0">
                <Button variant="outline" size="sm">
                  Contact Sales to Upgrade
                </Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Features Card — driven by entitlements from the DB */}
      {planDetails?.planConfig?.entitlements && planDetails.planConfig.entitlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {planDetails.planConfig.entitlements.map((e) => (
                <div key={e.feature} className="flex items-center gap-2 text-sm py-1">
                  {e.enabled ? (
                    <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  ) : (
                    <Lock className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                  )}
                  <span className={e.enabled ? 'text-foreground' : 'text-muted-foreground'}>{e.displayName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
