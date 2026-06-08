'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { showError } from '@/shared/lib/toast';
import { useGenerateNow, useSkipGeneration } from '../hooks/use-recurring-lanes';
import type { RecurringLane } from '../types';

interface UpcomingGenerationsQueueProps {
  lanes: RecurringLane[];
  isLoading: boolean;
}

function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatScheduleLabel(scheduleType: string): string {
  switch (scheduleType.toLowerCase()) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Bi-weekly';
    case 'monthly':
      return 'Monthly';
    case 'custom':
      return 'Custom';
    default:
      return scheduleType;
  }
}

function buildRoute(lane: RecurringLane): string | null {
  const origin = lane.originCity && lane.originState ? `${lane.originCity}, ${lane.originState}` : null;
  const destination =
    lane.destinationCity && lane.destinationState ? `${lane.destinationCity}, ${lane.destinationState}` : null;

  if (origin && destination) return `${origin} → ${destination}`;
  if (origin) return origin;
  if (destination) return destination;
  return null;
}

// ─── Action Row ────────────────────────────────────────────────────────────────

function ActionRow({ lane }: { lane: RecurringLane }) {
  const generateNow = useGenerateNow();
  const skipGeneration = useSkipGeneration();

  if (!lane.nextScheduledRunDate) return null;

  const today = getToday();
  const freight = new Date(lane.nextScheduledRunDate);
  freight.setHours(0, 0, 0, 0);
  const overdueDays = Math.floor((today.getTime() - freight.getTime()) / (1000 * 60 * 60 * 24));

  const isOverdue = overdueDays > 0;
  const isToday = overdueDays === 0;

  const month = freight.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = freight.getDate();

  const route = buildRoute(lane);
  const isPending = generateNow.isPending || skipGeneration.isPending;

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 py-3 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Date gutter */}
      <div className="flex md:flex-col items-center md:items-center gap-2 md:gap-0 md:w-14 shrink-0">
        <span
          className={cn(
            'text-2xs font-bold uppercase tracking-wide',
            isOverdue ? 'text-critical' : isToday ? 'text-caution' : 'text-muted-foreground',
          )}
        >
          {month}
        </span>
        <span
          className={cn(
            'text-lg font-bold leading-none',
            isOverdue ? 'text-critical' : isToday ? 'text-caution' : 'text-foreground',
          )}
        >
          {day}
        </span>
      </div>

      {/* Vertical divider (desktop) */}
      <div className="hidden md:block w-px self-stretch bg-border" />

      {/* Lane info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate">{lane.name}</span>
          <span className="text-xs text-muted-foreground">{formatScheduleLabel(lane.scheduleType)}</span>
        </div>
        {route && <p className="text-xs text-muted-foreground mt-0.5 truncate">{route}</p>}
        {lane.customerName && <p className="text-xs text-muted-foreground truncate">{lane.customerName}</p>}
      </div>

      {/* Urgency badge */}
      <div className="shrink-0 flex items-center gap-1.5">
        {lane.skipNextGeneration && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
            Skipped
          </span>
        )}
        {isOverdue ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wide bg-critical/10 text-critical">
            {overdueDays} day{overdueDays !== 1 ? 's' : ''} overdue
          </span>
        ) : isToday ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-bold uppercase tracking-wide bg-caution/10 text-caution">
            Today
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
        <Button
          size="sm"
          variant="default"
          className="h-8 text-xs flex-1 md:flex-none"
          onClick={() => generateNow.mutate(lane.id)}
          loading={isPending}
        >
          Generate
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground flex-1 md:flex-none"
          onClick={() => skipGeneration.mutate(lane.id)}
          loading={isPending}
          disabled={lane.skipNextGeneration}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

// ─── Autopilot Row ─────────────────────────────────────────────────────────────

function AutopilotRow({ lane }: { lane: RecurringLane }) {
  if (!lane.nextScheduledRunDate) return null;

  const today = getToday();

  let label: string;
  let pillClass: string;

  if (lane.skipNextGeneration) {
    label = 'Skipped — next will be auto-generated';
    pillClass = 'bg-caution/10 text-caution';
  } else if (lane.nextGenerationDate) {
    const genDate = new Date(lane.nextGenerationDate);
    genDate.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((genDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    label =
      daysUntil <= 0
        ? 'Auto-generates today'
        : daysUntil === 1
          ? 'Auto-generates tomorrow'
          : `Auto-generates in ${daysUntil} days`;
    pillClass = 'bg-muted text-muted-foreground';
  } else {
    label = 'Scheduled';
    pillClass = 'bg-muted text-muted-foreground';
  }

  const freight = new Date(lane.nextScheduledRunDate);
  freight.setHours(0, 0, 0, 0);
  const month = freight.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = freight.getDate();

  const route = buildRoute(lane);

  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 py-3 px-3 rounded-lg opacity-70">
      {/* Date gutter */}
      <div className="flex md:flex-col items-center md:items-center gap-2 md:gap-0 md:w-14 shrink-0">
        <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{month}</span>
        <span className="text-lg font-bold leading-none text-muted-foreground">{day}</span>
      </div>

      {/* Vertical divider (desktop) */}
      <div className="hidden md:block w-px self-stretch bg-border" />

      {/* Lane info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-muted-foreground truncate">{lane.name}</span>
          <span className="text-xs text-muted-foreground">{formatScheduleLabel(lane.scheduleType)}</span>
        </div>
        {route && <p className="text-xs text-muted-foreground mt-0.5 truncate">{route}</p>}
        {lane.customerName && <p className="text-xs text-muted-foreground truncate">{lane.customerName}</p>}
      </div>

      {/* Status pill */}
      <div className="shrink-0">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium', pillClass)}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function UpcomingGenerationsQueue({ lanes, isLoading }: UpcomingGenerationsQueueProps) {
  const { actionItems, autopilotItems } = useMemo(() => {
    const today = getToday();
    const action: RecurringLane[] = [];
    const autopilot: RecurringLane[] = [];

    for (const lane of lanes) {
      if (!lane.nextScheduledRunDate) continue;
      const freight = new Date(lane.nextScheduledRunDate);
      freight.setHours(0, 0, 0, 0);
      const isOverdue = freight < today;

      if (!lane.autoCreate || isOverdue) {
        action.push(lane);
      } else {
        autopilot.push(lane);
      }
    }

    // Sort by nextScheduledRunDate ascending
    const sortByDate = (a: RecurringLane, b: RecurringLane) =>
      new Date(a.nextScheduledRunDate!).getTime() - new Date(b.nextScheduledRunDate!).getTime();

    action.sort(sortByDate);
    autopilot.sort(sortByDate);

    return { actionItems: action, autopilotItems: autopilot };
  }, [lanes]);

  const hasActionItems = actionItems.length > 0;
  const hasAutopilotItems = autopilotItems.length > 0;
  const totalCount = actionItems.length + autopilotItems.length;

  // Default expanded if there are action items, collapsed if all autopilot
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const isExpanded = expanded ?? hasActionItems;

  const [generatingAll, setGeneratingAll] = useState(false);
  const generateNow = useGenerateNow();

  const handleGenerateAll = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setGeneratingAll(true);
      try {
        const results = await Promise.allSettled(actionItems.map((lane) => generateNow.mutateAsync(lane.id)));
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          showError(`${failed} of ${actionItems.length} lanes failed to generate`);
        }
      } finally {
        setGeneratingAll(false);
      }
    },
    [actionItems, generateNow],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
          <div className="flex-1" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
    );
  }

  // Nothing upcoming
  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header bar */}
      <button
        type="button"
        className="flex flex-wrap items-center gap-2 md:gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded(!isExpanded)}
      >
        <ChevronRight
          className={cn(
            'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
            isExpanded && 'rotate-90',
          )}
        />
        <span className="text-sm font-semibold text-foreground">Upcoming Generations</span>

        {/* Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasActionItems && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-caution/10 text-caution">
              {actionItems.length} need{actionItems.length === 1 ? 's' : ''} action
            </span>
          )}
          {hasAutopilotItems && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              {autopilotItems.length} on autopilot
            </span>
          )}
        </div>

        {/* Generate All button */}
        {hasActionItems && (
          <div className="ml-auto shrink-0">
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs"
              onClick={handleGenerateAll}
              loading={generatingAll}
            >
              Generate All ({actionItems.length})
            </Button>
          </div>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border px-2 py-2">
          {/* Action rows */}
          {actionItems.map((lane) => (
            <ActionRow key={lane.id} lane={lane} />
          ))}

          {/* Autopilot divider */}
          {hasActionItems && hasAutopilotItems && (
            <div className="flex items-center gap-3 px-3 py-2 my-1">
              <div className="h-2 w-2 rounded-full bg-muted-foreground shrink-0" />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">On Autopilot</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Autopilot rows */}
          {autopilotItems.map((lane) => (
            <AutopilotRow key={lane.id} lane={lane} />
          ))}
        </div>
      )}
    </div>
  );
}
