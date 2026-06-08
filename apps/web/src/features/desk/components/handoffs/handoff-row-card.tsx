'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, Inbox } from 'lucide-react';

import { queryKeys } from '@/shared/constants/query-keys';
import { cn } from '@/shared/lib/utils';
import { formatDuration, formatRelativeTime } from '@/shared/lib/utils/formatters';

import { deskApi } from '../../api';
import { useDeskStore } from '../../store/desk-store';
import type { EpisodeListItem } from '../../types';

interface HandoffRowCardProps {
  row: EpisodeListItem;
}

export function HandoffRowCard({ row }: HandoffRowCardProps) {
  const openEpisode = useDeskStore((s) => s.openEpisode);
  const qc = useQueryClient();

  // Prefetch the detail payload on hover — by the time the user clicks, the
  // sheet reads from the cache and opens without a network round-trip.
  const onHover = () => {
    qc.prefetchQuery({
      queryKey: queryKeys.desk.episode(row.episodeId),
      queryFn: () => deskApi.episodes.get(row.episodeId),
      staleTime: 10_000,
    });
  };

  const isEscalation = row.status === 'ESCALATED';
  const hoursToExpiry = row.expiresAt
    ? Math.max(0, (new Date(row.expiresAt).getTime() - Date.now()) / 3_600_000)
    : null;
  const urgent = hoursToExpiry != null && hoursToExpiry < 24;
  const priorityChip =
    row.priority === 'HIGH' || row.priority === 'URGENT' ? (
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase',
          row.priority === 'URGENT' ? 'bg-destructive/15 text-destructive' : 'bg-caution/15 text-caution',
        )}
      >
        {row.priority}
      </span>
    ) : null;

  return (
    <button
      type="button"
      onClick={() => openEpisode(row.episodeId)}
      onMouseEnter={onHover}
      className={cn(
        'w-full rounded-lg border border-border bg-card p-4 text-left',
        'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'transition-colors',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isEscalation ? (
            <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden />
          ) : (
            <Inbox className="h-4 w-4 text-yellow-500" aria-hidden />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground truncate">{row.decisionTitle}</p>
            <div className="flex items-center gap-2">
              {priorityChip}
              {urgent && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                  Expires {formatDuration(hoursToExpiry!)}
                </span>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {isEscalation ? 'Escalated' : 'Waiting approval'}
              </span>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate">
              {row.agentName} · {row.responsibilityTitle}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="h-3 w-3" aria-hidden />
              {formatRelativeTime(row.requestedAt ?? row.openedAt)}
            </span>
          </div>
          {isEscalation && row.escalationReason && (
            <p className="mt-1.5 text-xs italic text-destructive/80">Reason: {row.escalationReason}</p>
          )}
        </div>
      </div>
    </button>
  );
}
