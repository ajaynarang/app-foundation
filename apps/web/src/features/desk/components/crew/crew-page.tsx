'use client';

import { useMemo, useState } from 'react';

import { Skeleton } from '@/shared/components/ui/skeleton';

import { useAgents } from '../../hooks/use-agents';
import { useDeskStore } from '../../store/desk-store';
import type { AgentRosterItem } from '../../types';

import { AgentRow } from './agent-row';
import { CrewToolbar, type CrewSortKey } from './crew-toolbar';
import { DeskScheduleSwitch } from './desk-schedule-switch';

/**
 * Crew tab — row directory of all 12 agents, active first. Click a row
 * to open the agent sheet.
 */
export function CrewPage() {
  const openAgent = useDeskStore((s) => s.openAgent);
  const { data: agents, isLoading } = useAgents();
  const [sortBy, setSortBy] = useState<CrewSortKey>('most-active');
  const [searchQuery, setSearchQuery] = useState('');

  const sorted = useMemo(() => (agents ? sortAgents(agents, sortBy) : []), [agents, sortBy]);
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.key.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q),
    );
  }, [sorted, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <DeskScheduleSwitch />
        <CrewSkeleton />
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="space-y-4">
        <DeskScheduleSwitch />
        <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">No agents seeded for this tenant yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DeskScheduleSwitch />
      <CrewToolbar
        agents={agents}
        sortBy={sortBy}
        onSortChange={setSortBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[2fr_1.3fr_1fr_1.2fr_1fr_24px] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
          <span>Agent</span>
          <span>Responsibilities</span>
          <span>Workload</span>
          <span>Supervisor</span>
          <span>Last activity</span>
          <span className="sr-only">Open</span>
        </div>
        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No agents match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          visible.map((agent) => <AgentRow key={agent.key} agent={agent} onOpen={openAgent} />)
        )}
      </div>
    </div>
  );
}

function sortAgents(agents: AgentRosterItem[], by: CrewSortKey): AgentRosterItem[] {
  if (by === 'alphabetical') {
    return [...agents].sort((a, b) => a.name.localeCompare(b.name));
  }
  // Most active: by available responsibility count desc, then lastRunAt desc.
  return [...agents].sort((a, b) => {
    const respDelta = b.availableResponsibilityCount - a.availableResponsibilityCount;
    if (respDelta !== 0) return respDelta;
    const aLast = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
    const bLast = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
    return bLast - aLast;
  });
}

function CrewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="m-3 h-10" />
        ))}
      </div>
    </div>
  );
}
