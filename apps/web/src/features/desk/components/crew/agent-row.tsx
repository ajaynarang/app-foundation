'use client';

import { ChevronRight } from 'lucide-react';

import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

import type { AgentKey, AgentRosterItem } from '../../types';

import { AgentAvatar } from './agent-avatar';

interface AgentRowProps {
  agent: AgentRosterItem;
  onOpen: (key: AgentKey) => void;
}

/**
 * One row in the Crew directory. Five content columns:
 *   Agent (avatar + name + badge, 2fr) · Responsibilities (1.3fr) ·
 *   Workload (1fr) · Supervisor (1.2fr) · Last activity (1fr) · chevron (24px)
 *
 * At <md, collapses to Agent · chevron.
 */
export function AgentRow({ agent, onOpen }: AgentRowProps) {
  const isComingSoon = agent.availableResponsibilityCount === 0;
  const variant = isComingSoon ? 'coming-soon' : 'active';

  return (
    <button
      type="button"
      onClick={() => onOpen(agent.key)}
      className={cn(
        'grid w-full grid-cols-[1fr_24px] items-center gap-3 border-b border-border px-4 py-3 text-left',
        'md:grid-cols-[2fr_1.3fr_1fr_1.2fr_1fr_24px]',
        'transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
        'last:border-b-0',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AgentAvatar agentKey={agent.key} variant={variant} />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
          {isComingSoon ? (
            <Badge variant="muted" className="text-[10px] uppercase tracking-wider">
              Coming soon
            </Badge>
          ) : (
            <Badge variant="default" className="text-[10px] uppercase tracking-wider">
              Active
            </Badge>
          )}
        </div>
      </div>

      <div className="hidden min-w-0 md:block">
        <ResponsibilitiesCell agent={agent} isComingSoon={isComingSoon} />
      </div>

      <div className="hidden md:block">
        <WorkloadCell agent={agent} isComingSoon={isComingSoon} />
      </div>

      <div className="hidden min-w-0 md:block">
        <SupervisorCell supervisor={agent.supervisor} />
      </div>

      <div className="hidden md:block">
        {isComingSoon ? (
          <span className="text-xs italic text-muted-foreground">—</span>
        ) : agent.lastRunAt ? (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(agent.lastRunAt)}</span>
        ) : (
          <span className="text-xs italic text-muted-foreground">never</span>
        )}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </button>
  );
}

function SupervisorCell({ supervisor }: { supervisor: AgentRosterItem['supervisor'] }) {
  if (!supervisor) {
    return <span className="text-xs italic text-muted-foreground">Unassigned</span>;
  }
  const initials = `${supervisor.firstName[0] ?? ''}${supervisor.lastName[0] ?? ''}`.toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        {initials}
      </span>
      <span className="truncate text-xs text-foreground">
        {supervisor.firstName} {supervisor.lastName}
      </span>
    </div>
  );
}

function ResponsibilitiesCell({ agent, isComingSoon }: { agent: AgentRosterItem; isComingSoon: boolean }) {
  if (isComingSoon) {
    const count = agent.comingSoonResponsibilityCount;
    if (count === 0) {
      return <span className="text-xs italic text-muted-foreground">No responsibilities yet</span>;
    }
    return (
      <span className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{count}</span> coming soon
      </span>
    );
  }
  const active = agent.availableResponsibilityCount;
  const pending = agent.comingSoonResponsibilityCount;
  return (
    <span className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{active}</span>{' '}
      {active === 1 ? 'responsibility' : 'responsibilities'}
      {pending > 0 ? <span className="ml-1 text-muted-foreground/70">(+{pending} pending)</span> : null}
    </span>
  );
}

function WorkloadCell({ agent, isComingSoon }: { agent: AgentRosterItem; isComingSoon: boolean }) {
  if (isComingSoon) {
    return <span className="text-xs italic text-muted-foreground">—</span>;
  }
  const pending = agent.pendingApprovalCount;
  const open = agent.openEpisodeCount;
  let summary: React.ReactNode;
  if (pending > 0) {
    summary = (
      <>
        <span className="font-medium text-foreground">{pending}</span> waiting on you
      </>
    );
  } else if (open > 0) {
    summary = (
      <>
        <span className="font-medium text-foreground">{open}</span> running
      </>
    );
  } else {
    summary = 'All caught up';
  }
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          pending > 0 ? 'bg-red-500 dark:bg-red-400' : 'bg-emerald-500 dark:bg-emerald-400',
        )}
        aria-hidden
      />
      <span className="text-xs text-muted-foreground">{summary}</span>
    </div>
  );
}
