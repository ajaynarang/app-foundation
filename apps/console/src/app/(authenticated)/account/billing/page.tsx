'use client';

import { CONTACTS, mailto } from '@/lib/contacts';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Progress } from '@sally/ui/components/ui/progress';
import { AlertTriangle } from 'lucide-react';
import { usePlan } from '@/features/plans/use-plan';

type BadgeVariant = 'destructive' | 'outline' | 'default' | 'muted';

function planBadgeVariant(plan?: string): BadgeVariant {
  if (!plan) return 'outline';
  if (plan === 'TRIAL_EXPIRED' || plan === 'SUSPENDED') return 'destructive';
  if (plan === 'TRIAL') return 'muted';
  return 'default';
}

export default function BillingPage() {
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
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your payment methods and billing details</p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-64" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">Manage your payment methods and billing details</p>
      </div>

      <div className="space-y-6">
        {/* Current Plan Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle>Current Plan</CardTitle>
              <Badge variant={planBadgeVariant(plan)}>{plan ?? 'Unknown'}</Badge>
            </div>
            <CardDescription>{displayName ?? plan ?? 'Unknown'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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

            {plan !== 'ENTERPRISE' && plan !== 'SUSPENDED' && (
              <a href={mailto('sally')} className="inline-block">
                <Button variant="outline" size="sm">
                  Contact Sales to Upgrade
                </Button>
              </a>
            )}
          </CardContent>
        </Card>

        {/* Fleet Usage Card */}
        {fleetLimit !== null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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

        {/* Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
            <CardDescription>Payment method management coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Contact{' '}
              <a
                href={mailto('sallySupport')}
                className="text-foreground underline underline-offset-4 hover:text-muted-foreground"
              >
                {CONTACTS.sallySupport}
              </a>{' '}
              for billing inquiries.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
