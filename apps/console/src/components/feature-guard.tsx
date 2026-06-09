'use client';

import { type ReactNode } from 'react';
import { Sparkles, AlertTriangle, ShieldOff } from 'lucide-react';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { usePlan } from '../features/plans/use-plan';

/**
 * Simple registry mapping entitlement keys to human-readable descriptions.
 */
const featureDescriptions: Record<string, { label: string; description: string; requiredPlan: string }> = {
  api_keys: {
    label: 'API Keys',
    description: 'Create server-to-server API keys for programmatic access to the platform.',
    requiredPlan: 'Freight Force',
  },
  webhooks: {
    label: 'Webhooks',
    description: 'Receive real-time event notifications via HTTP callbacks.',
    requiredPlan: 'Freight Force',
  },
  oauth_clients: {
    label: 'OAuth Clients',
    description: 'Register OAuth applications for user-authorized integrations.',
    requiredPlan: 'Freight Force',
  },
  samsara_integration: {
    label: 'Integrations',
    description: 'Connect Samsara, QuickBooks, and external TMS systems to sync fleet data.',
    requiredPlan: 'Fleet',
  },
};

interface ConsoleFeatureGuardProps {
  entitlementKey: string;
  children: ReactNode;
}

export function ConsoleFeatureGuard({ entitlementKey, children }: ConsoleFeatureGuardProps) {
  const { hasEntitlement, isLoading } = usePlan();

  // Optimistic: show children while loading
  if (isLoading) {
    return <>{children}</>;
  }

  if (hasEntitlement(entitlementKey)) {
    return <>{children}</>;
  }

  const featureInfo = featureDescriptions[entitlementKey];
  const requiredPlan = featureInfo?.requiredPlan ?? 'Freight Force';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <Sparkles className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">
            Upgrade to <span className="text-amber-500">{requiredPlan}</span>
          </h2>
          {featureInfo && <p className="text-sm text-muted-foreground">{featureInfo.description}</p>}
          <a
            href="mailto:sales@appshore.in?subject=Plan Upgrade Inquiry"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mt-2"
          >
            Contact Sales
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Full-screen blocker for TRIAL_EXPIRED and SUSPENDED states in the console.
 */
export function ConsolePlanBlockedScreen() {
  const { plan, isTrialExpired } = usePlan();
  const isSuspended = plan === 'SUSPENDED';

  if (!isTrialExpired && !isSuspended) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <div className="flex-1 flex items-center justify-center bg-background px-4">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
          {isSuspended ? (
            <ShieldOff className="h-8 w-8 text-red-600 dark:text-red-400" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
          )}
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {isSuspended ? 'Account Suspended' : 'Your Trial Has Ended'}
        </h1>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {isSuspended
            ? 'Your account has been suspended. Please contact support to resolve this issue.'
            : 'Your 30-day free trial has expired. Upgrade to a paid plan to continue using the platform.'}
        </p>
        {isTrialExpired && (
          <p className="text-xs text-muted-foreground">Your data is safe — it will be available once you upgrade.</p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {isTrialExpired && (
            <a
              href={`${appUrl}/pricing`}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              View Plans & Pricing
            </a>
          )}
          <a
            href={`mailto:${isSuspended ? 'support' : 'sales'}@appshore.in`}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 border border-input bg-background hover:bg-muted transition-colors"
          >
            {isSuspended ? 'Contact Support' : 'Contact Sales'}
          </a>
        </div>
      </div>
    </div>
  );
}
