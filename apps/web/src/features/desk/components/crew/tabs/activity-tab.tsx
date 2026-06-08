'use client';

import { useMemo } from 'react';
import { Bot, CircleCheck, CircleX, Clock, UserCheck } from 'lucide-react';

import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

import { useAgentActivity } from '../../../hooks/use-agents';
import { useEpisodes } from '../../../hooks/use-episodes';
import { useResponsibilities } from '../../../hooks/use-responsibilities';
import { useDeskStore } from '../../../store/desk-store';
import type { AgentKey, DeskEpisodeListItem } from '../../../types';

interface ActivityTabProps {
  agentKey: AgentKey;
}

/**
 * Activity tab — last 50 episodes for this agent. Shows:
 *   - Top stats strip: 7-day episode / tool-call / approval counts
 *   - One row per episode: status icon · entity label · actor (Sally
 *     or human) · outcome one-liner · relative time
 *   - Click row → episode detail sheet (step timeline)
 */
export function ActivityTab({ agentKey }: ActivityTabProps) {
  const openEpisode = useDeskStore((s) => s.openEpisode);
  const responsibilities = useResponsibilities();
  const episodes = useEpisodes({ limit: 50 });
  const activity = useAgentActivity(agentKey, '7d');

  const responsibilityKeys = useMemo(
    () => new Set((responsibilities.data ?? []).filter((r) => r.agentKey === agentKey).map((r) => r.key)),
    [responsibilities.data, agentKey],
  );

  const rows = useMemo(
    () => (episodes.data?.rows ?? []).filter((e) => responsibilityKeys.has(e.responsibilityKey)),
    [episodes.data, responsibilityKeys],
  );

  const isLoading = episodes.isLoading || responsibilities.isLoading;

  return (
    <div className="space-y-4">
      <ActivityStats activity={activity.data} loading={activity.isLoading} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No activity yet for this agent. Episodes appear here when triggers fire.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((e) => (
            <ActivityRow key={e.id} episode={e} onOpen={() => openEpisode(e.id)} />
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Stats strip ────────────────────────────────────────────────────────

function ActivityStats({
  activity,
  loading,
}: {
  activity: { episodeCount: number; toolCallCount: number; approvalCount: number } | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    );
  }
  const ep = activity?.episodeCount ?? 0;
  const tc = activity?.toolCallCount ?? 0;
  const ap = activity?.approvalCount ?? 0;
  return (
    <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-muted/30 p-3 text-center">
      <StatCell value={ep} label={ep === 1 ? 'episode' : 'episodes'} />
      <StatCell value={tc} label={tc === 1 ? 'tool call' : 'tool calls'} />
      <StatCell value={ap} label={ap === 1 ? 'approval' : 'approvals'} />
      <p className="col-span-3 -mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Last 7 days</p>
    </div>
  );
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────

function ActivityRow({ episode, onOpen }: { episode: DeskEpisodeListItem; onOpen: () => void }) {
  const { icon, tone, label } = describeEpisodeOutcome(episode);
  const actor = describeActor(episode);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <StatusIcon icon={icon} tone={tone} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{episode.entityLabel ?? 'Episode'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ActorBadge actor={actor} />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {formatRelativeTime(episode.triggerFiredAt)}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

type OutcomeIcon = 'running' | 'success' | 'fail' | 'waiting';
type OutcomeTone = 'running' | 'success' | 'fail' | 'waiting';

function describeEpisodeOutcome(e: DeskEpisodeListItem): {
  icon: OutcomeIcon;
  tone: OutcomeTone;
  label: string;
} {
  if (e.status === 'RUNNING') {
    return { icon: 'running', tone: 'running', label: 'Sally is working on it' };
  }
  if (e.status === 'WAITING_APPROVAL') {
    return { icon: 'waiting', tone: 'waiting', label: 'Waiting for your approval' };
  }
  if (e.status === 'ESCALATED') {
    return { icon: 'waiting', tone: 'waiting', label: e.outcomeNote ?? 'Escalated to you' };
  }
  if (e.status === 'FAILED') {
    return { icon: 'fail', tone: 'fail', label: e.outcomeNote ?? 'Sally could not complete it' };
  }
  // succeeded or resolved — customize by outcome code
  if (e.outcome === 'auto_sent') {
    return { icon: 'success', tone: 'success', label: 'Sally handled it without asking' };
  }
  if (e.outcome === 'approved_and_sent') {
    return { icon: 'success', tone: 'success', label: 'You approved · Sally sent it' };
  }
  if (e.outcome === 'rejected') {
    return { icon: 'fail', tone: 'fail', label: 'You rejected — nothing sent' };
  }
  if (e.outcome) {
    return { icon: 'success', tone: 'success', label: humanize(e.outcome) };
  }
  return { icon: 'success', tone: 'success', label: 'Completed' };
}

function humanize(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusIcon({ icon, tone }: { icon: OutcomeIcon; tone: OutcomeTone }) {
  const Cmp = icon === 'running' ? Clock : icon === 'success' ? CircleCheck : icon === 'fail' ? CircleX : Clock;
  const toneClass =
    tone === 'running'
      ? 'text-muted-foreground'
      : tone === 'success'
        ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'fail'
          ? 'text-destructive'
          : 'text-caution';
  return <Cmp className={cn('mt-0.5 h-4 w-4 shrink-0', toneClass)} aria-hidden />;
}

// ─── Actor attribution ──────────────────────────────────────────────────

type Actor = 'sally' | 'human' | 'mixed';

function describeActor(e: DeskEpisodeListItem): Actor {
  // Heuristic: if status involves approval or outcome references approval/rejection,
  // a human touched this episode. Otherwise Sally-only.
  if (e.status === 'WAITING_APPROVAL' || e.status === 'ESCALATED') return 'human';
  const o = e.outcome ?? '';
  if (o === 'auto_sent') return 'sally';
  if (o === 'approved_and_sent' || o === 'rejected' || o.includes('approved') || o.includes('rejected')) {
    return 'mixed';
  }
  return 'sally';
}

function ActorBadge({ actor }: { actor: Actor }) {
  if (actor === 'human') {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] font-normal">
        <UserCheck className="h-3 w-3" aria-hidden />
        You
      </Badge>
    );
  }
  if (actor === 'mixed') {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] font-normal">
        <Bot className="h-3 w-3" aria-hidden />
        Sally + you
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1 text-[10px] font-normal">
      <Bot className="h-3 w-3" aria-hidden />
      Sally
    </Badge>
  );
}
