'use client';

import Link from 'next/link';
import { CreditCard, Users, Plug } from 'lucide-react';
import { cn } from '@app/ui';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { usePlan } from '@/features/plans/use-plan';
import { useIntegrationHealth } from '@/hooks/use-integrations';
import { useTeamMembers, useInvitations } from '@/hooks/use-team';

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <Skeleton className="h-5 w-5" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

export function OverviewCards() {
  const { plan, displayName, isLoading: planLoading, vehicleCount, fleetLimit } = usePlan();
  const { data: health, isLoading: healthLoading } = useIntegrationHealth();
  const { data: members, isLoading: membersLoading } = useTeamMembers();
  const { data: invitations, isLoading: invitationsLoading } = useInvitations();

  const isLoading = planLoading || healthLoading || membersLoading || invitationsLoading;

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  // Plan & Usage — show vehicle + user counts
  const activeMembers = members?.filter((m) => m.isActive)?.length ?? 0;
  const usageParts: string[] = [];
  if (fleetLimit) {
    usageParts.push(`${vehicleCount}/${fleetLimit} vehicles`);
  } else if (vehicleCount > 0) {
    usageParts.push(`${vehicleCount} vehicles`);
  }
  usageParts.push(`${activeMembers} user${activeMembers !== 1 ? 's' : ''}`);
  const planDetail = usageParts.join(' · ');

  // Team — member count + pending invitations
  const pendingInvitations = invitations?.filter((i) => i.status === 'PENDING')?.length ?? 0;
  const teamDetail =
    pendingInvitations > 0
      ? `${pendingInvitations} pending invitation${pendingInvitations !== 1 ? 's' : ''}`
      : 'All invitations accepted';

  // Integrations — connected count + health status
  const tmsHasError = health?.tms?.hasError ?? false;
  const eldHasError = health?.eld?.hasError ?? false;
  const errorCount = [tmsHasError, eldHasError].filter(Boolean).length;
  const configuredTypes: string[] = health?.configuredTypes ?? [];
  const connectedCount = configuredTypes.length;
  const integrationDetail =
    errorCount > 0
      ? `${errorCount} sync error${errorCount !== 1 ? 's' : ''}`
      : connectedCount > 0
        ? 'All healthy'
        : 'None configured';

  const cards = [
    {
      title: 'Plan & Usage',
      icon: CreditCard,
      value: displayName ?? plan ?? 'Unknown',
      detail: planDetail,
      href: '/account/plan',
    },
    {
      title: 'Team',
      icon: Users,
      value: `${activeMembers} member${activeMembers !== 1 ? 's' : ''}`,
      detail: teamDetail,
      href: '/team/members',
    },
    {
      title: 'Integrations',
      icon: Plug,
      value: `${connectedCount} connected`,
      detail: integrationDetail,
      detailColor:
        errorCount > 0
          ? 'text-red-500 dark:text-red-400'
          : connectedCount > 0
            ? 'text-green-600 dark:text-green-400'
            : undefined,
      href: '/integrations/connections',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.title}
            href={card.href}
            className={cn(
              'group flex flex-col gap-4 rounded-lg border border-border bg-card p-6',
              'transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
            )}
          >
            <div className="flex items-center justify-between">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{card.value}</p>
              <p
                className={cn(
                  'mt-0.5 text-sm',
                  'detailColor' in card && card.detailColor ? card.detailColor : 'text-muted-foreground',
                )}
              >
                {card.detail}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
