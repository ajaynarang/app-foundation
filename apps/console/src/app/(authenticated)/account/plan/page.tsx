'use client';

import { mailto } from '@/lib/contacts';
import { Check, Lock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Progress } from '@sally/ui/components/ui/progress';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
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
  const {
    plan,
    displayName,
    planDetails,
    isLoading,
    vehicleCount,
    fleetLimit,
    fleetLimitWarning,
    isTrialExpired,
    isOnTrial,
    daysLeftInTrial,
  } = usePlan();

  const usagePercent = fleetLimit && fleetLimit > 0 ? Math.min((vehicleCount / fleetLimit) * 100, 100) : 0;

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
              {planDetails?.planConfig?.pricePerUnit != null ? (
                <p className="text-sm text-muted-foreground">
                  ${planDetails.planConfig.pricePerUnit} / {planDetails.planConfig.unitLabel}
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
              <a href={mailto('sally')} className="shrink-0">
                <Button variant="outline" size="sm">
                  Contact Sales to Upgrade
                </Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fleet Usage Card (only if limit exists) */}
      {fleetLimit !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              Fleet Usage
              {fleetLimitWarning && <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Vehicles</span>
              <span
                className={
                  fleetLimitWarning
                    ? 'font-semibold text-yellow-700 dark:text-yellow-400'
                    : 'font-medium text-foreground'
                }
              >
                {vehicleCount} / {fleetLimit}
              </span>
            </div>
            <Progress value={usagePercent} className="h-2 bg-gray-200 dark:bg-gray-800" />
            {fleetLimitWarning && (
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                You are approaching your fleet limit. Contact sales to upgrade.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
