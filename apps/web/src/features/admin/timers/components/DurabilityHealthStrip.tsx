'use client';

import { AlertTriangle, Clock, Hourglass, Send, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { RelativeTime } from '@/shared/components/page-chrome';
import { useDurabilityHealth } from '../hooks';

/** The KPI row above the list: what the sweeper is holding, what is late, what keeps failing, the outbox backlog. */
export function DurabilityHealthStrip() {
  const health = useDurabilityHealth();
  const deadlines = health.data?.deadlines;
  const outbox = health.data?.outbox;
  const isLoading = health.isLoading;

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      <HealthCard
        icon={Hourglass}
        label="Pending"
        value={deadlines?.pending}
        isLoading={isLoading}
        isError={health.isError}
      />
      <HealthCard
        icon={AlertTriangle}
        label="Failing"
        value={deadlines?.failing}
        isLoading={isLoading}
        isError={health.isError}
        isAlarm={!!deadlines?.failing}
      />
      <HealthCard
        icon={Clock}
        label="Overdue"
        value={deadlines?.overdue}
        isLoading={isLoading}
        isError={health.isError}
        isAlarm={!!deadlines?.overdue}
        detail={
          deadlines?.oldestOverdueDueAt ? (
            <RelativeTime iso={deadlines.oldestOverdueDueAt} prefix="oldest due" />
          ) : undefined
        }
      />
      <HealthCard
        icon={Send}
        label="Outbox unpublished"
        value={outbox?.unpublished}
        isLoading={isLoading}
        isError={health.isError}
        isAlarm={!!outbox?.unpublished}
        detail={
          health.data && !outbox
            ? 'Not reporting yet'
            : outbox?.oldestAgeSeconds != null
              ? `oldest ${Math.round(outbox.oldestAgeSeconds)}s`
              : undefined
        }
      />
    </div>
  );
}

interface HealthCardProps {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  isAlarm?: boolean;
  detail?: ReactNode;
}

function HealthCard({ icon: Icon, label, value, isLoading, isError, isAlarm, detail }: HealthCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      {isError ? (
        <p className="mt-1 text-sm text-critical-text">Couldn&apos;t load</p>
      ) : isLoading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className={`mt-1 text-2xl font-bold tabular-nums ${isAlarm ? 'text-caution-text' : 'text-foreground'}`}>
          {value ?? '—'}
        </p>
      )}
      {detail && !isError && !isLoading && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
