'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';

// Sally's Desk is the default landing while the Home page is paused (#747).
// Tenants entitled to Sally's Desk land on it; everyone else falls back to
// Loads — the universal core TMS surface — instead of the Desk feature-gate
// screen. The decision lives here so the bare `/dispatcher` route and every
// post-login flow (which all resolve to `/dispatcher`) share one rule.
const DESK_FEATURE_KEY = 'sallys_desk';
const DESK_ROUTE = '/dispatcher/desk';
const LOADS_ROUTE = '/dispatcher/loads';

/**
 * Bare `/dispatcher` has no page of its own while Home is paused. This resolves
 * the right default surface for the tenant and redirects there, showing a
 * skeleton until the plan entitlement is known (avoids landing-route flicker).
 */
export function DispatcherDefaultRedirect() {
  const router = useRouter();
  const { hasFeature, isLoading } = usePlan();

  useEffect(() => {
    if (isLoading) return;
    router.replace(hasFeature(DESK_FEATURE_KEY) ? DESK_ROUTE : LOADS_ROUTE);
  }, [isLoading, hasFeature, router]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
