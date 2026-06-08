'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Key, UserPlus, CreditCard } from 'lucide-react';
import { cn } from '@app/ui';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { usePlan } from '@/features/plans/use-plan';
import { useIntegrationHealth } from '@/hooks/use-integrations';
import { useInvitations } from '@/hooks/use-team';
import { useApiKeys } from '@/features/api-keys/use-api-keys';

interface AttentionItem {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  detail: string;
  href: string;
  priority: number; // lower = higher priority
}

function ItemSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4 px-6 py-4">
      <div className="flex items-start gap-3">
        <Skeleton className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
    </div>
  );
}

export function AttentionItems() {
  const { isLoading: planLoading, ...planData } = usePlan();
  const { data: health, isLoading: healthLoading } = useIntegrationHealth();
  const { data: invitations, isLoading: invitationsLoading } = useInvitations();
  const { data: apiKeys, isLoading: apiKeysLoading } = useApiKeys();

  const isLoading = planLoading || healthLoading || invitationsLoading || apiKeysLoading;

  const items = useMemo(() => {
    if (isLoading) return [];

    const result: AttentionItem[] = [];

    // 1. Integration sync errors (highest priority)
    if (health?.tms?.hasError) {
      result.push({
        id: 'tms-error',
        icon: AlertTriangle,
        iconColor: 'text-red-500 dark:text-red-400',
        title: `${health.tms.displayName ?? 'TMS'} sync error`,
        detail: health.tms.lastErrorMessage ?? 'Sync failed',
        href: '/integrations/sync',
        priority: 1,
      });
    }
    if (health?.eld?.hasError) {
      result.push({
        id: 'eld-error',
        icon: AlertTriangle,
        iconColor: 'text-red-500 dark:text-red-400',
        title: `${health.eld.displayName ?? 'ELD'} sync error`,
        detail: health.eld.lastErrorMessage ?? 'Sync failed',
        href: '/integrations/sync',
        priority: 1,
      });
    }

    // 2. API keys expiring within 30 days
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiringKeys =
      apiKeys?.filter((k) => {
        if (!k.isActive || !k.expiresAt) return false;
        const expiresAt = new Date(k.expiresAt);
        return expiresAt.getTime() - now.getTime() < thirtyDaysMs;
      }) ?? [];

    for (const key of expiringKeys) {
      const expiresAt = new Date(key.expiresAt!);
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      result.push({
        id: `key-expiring-${key.id}`,
        icon: Key,
        iconColor: 'text-yellow-500 dark:text-yellow-400',
        title: `API key "${key.name}" expiring soon`,
        detail: daysLeft <= 0 ? 'Expired' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`,
        href: '/developer/api-keys',
        priority: 2,
      });
    }

    // 3. Trial ending within 7 days
    if (planData.isOnTrial && planData.daysLeftInTrial !== null && planData.daysLeftInTrial <= 7) {
      result.push({
        id: 'trial-ending',
        icon: CreditCard,
        iconColor: 'text-yellow-500 dark:text-yellow-400',
        title: 'Trial ending soon',
        detail: `${planData.daysLeftInTrial} day${planData.daysLeftInTrial !== 1 ? 's' : ''} remaining`,
        href: '/account/plan',
        priority: 3,
      });
    }

    // 4. Fleet limit approaching (>=80%)
    if (planData.fleetLimit && planData.vehicleCount / planData.fleetLimit >= 0.8) {
      const pct = Math.round((planData.vehicleCount / planData.fleetLimit) * 100);
      result.push({
        id: 'fleet-limit',
        icon: AlertTriangle,
        iconColor: 'text-yellow-500 dark:text-yellow-400',
        title: 'Approaching fleet limit',
        detail: `${planData.vehicleCount}/${planData.fleetLimit} vehicles (${pct}%)`,
        href: '/account/plan',
        priority: 4,
      });
    }

    // 5. Pending invitations
    const pending = invitations?.filter((i) => i.status === 'PENDING') ?? [];
    for (const inv of pending) {
      const createdAt = new Date(inv.createdAt);
      const daysAgo = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
      result.push({
        id: `invite-${inv.id}`,
        icon: UserPlus,
        iconColor: 'text-blue-500 dark:text-blue-400',
        title: `Invitation pending — ${inv.email ?? `${inv.firstName} ${inv.lastName}`}`,
        detail: daysAgo === 0 ? 'Sent today' : `Sent ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`,
        href: '/team/invitations',
        priority: 5,
      });
    }

    // Sort by priority
    result.sort((a, b) => a.priority - b.priority);

    return result;
  }, [isLoading, health, apiKeys, planData, invitations]);

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Needs Attention</h2>
      <div className="rounded-lg border border-border bg-card">
        {isLoading ? (
          <div className="divide-y divide-border">
            <ItemSkeleton />
            <ItemSkeleton />
            <ItemSkeleton />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 px-6 py-8">
            <CheckCircle2 className="h-5 w-5 text-green-500 dark:text-green-400" />
            <p className="text-sm text-muted-foreground">Nothing needs your attention</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-start gap-3 px-6 py-4',
                      'transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                      'first:rounded-t-lg last:rounded-b-lg',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', item.iconColor)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
