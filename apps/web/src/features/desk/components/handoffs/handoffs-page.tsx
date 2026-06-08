'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';

import { useAuthStore } from '@/features/auth/store';

import { useApprovals, useHandoffCounts } from '../../hooks/use-approvals';
import { useEpisodes } from '../../hooks/use-episodes';
import { useAgents } from '../../hooks/use-agents';
import { useResponsibilities } from '../../hooks/use-responsibilities';
import { AGENT_FILTER_ALL, HANDOFF_FILTERS, useDeskStore } from '../../store/desk-store';
import { ESCALATED_STATUS, type AgentKey, type ApprovalScope, type EpisodeListItem } from '../../types';

import { HandoffFilters } from './handoff-filters';
import { HandoffRowCard } from './handoff-row-card';
import { HandoffsScopeToggle } from './handoffs-scope-toggle';

const SUPERVISOR_ROLES = new Set(['DISPATCHER']);
const SCOPE_PARAM = 'scope';

export function HandoffsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const urlScope = searchParams.get(SCOPE_PARAM) as ApprovalScope | null;

  const searchQuery = useDeskStore((s) => s.searchQuery);
  const setSearchQuery = useDeskStore((s) => s.setSearchQuery);
  const handoffFilter = useDeskStore((s) => s.handoffFilter);
  const agentFilter = useDeskStore((s) => s.agentFilter);

  // Default scope: DISPATCHER → 'mine', everyone else → 'all'.
  const defaultScope: ApprovalScope = user && SUPERVISOR_ROLES.has(user.role) ? 'mine' : 'all';
  const scope: ApprovalScope = urlScope === 'mine' || urlScope === 'all' ? urlScope : defaultScope;

  const onScopeChange = (next: ApprovalScope) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set(SCOPE_PARAM, next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // One list query for the active scope (Mine or All) — the inactive scope's
  // count comes from the cheap `useHandoffCounts()` aggregate below. That's
  // two full 100-row payloads removed from every Handoffs tab render.
  const approvals = useApprovals({ scope, limit: 100 });
  const escalated = useEpisodes({ status: ESCALATED_STATUS, scope, limit: 100 });
  const { data: handoffCounts } = useHandoffCounts();

  const agents = useAgents();
  const responsibilities = useResponsibilities();

  // Responsibility → title + agent lookups. Escalation rows come from the
  // episode list endpoint which carries agent/responsibility keys but not
  // display strings — we synthesize the slim `EpisodeListItem` shape below
  // by joining against these maps client-side.
  const responsibilityIndex = useMemo(() => {
    const byKey = new Map<string, { title: string; agentKey: string }>();
    (responsibilities.data ?? []).forEach((r) => byKey.set(r.key, { title: r.title, agentKey: r.agentKey }));
    return byKey;
  }, [responsibilities.data]);

  const agentNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    (agents.data ?? []).forEach((a) => map.set(a.key, a.name));
    return map;
  }, [agents.data]);

  // Unified slim shape (row = episode). Pending approvals already arrive
  // shaped as EpisodeListItem. Escalations get synthesized into the same
  // shape so a single row card renders both kinds uniformly.
  const rows: EpisodeListItem[] = useMemo(() => {
    const approvalRows: EpisodeListItem[] = approvals.data ?? [];
    const escalationRows: EpisodeListItem[] = (escalated.data?.rows ?? []).map((e) => {
      const resp = responsibilityIndex.get(e.responsibilityKey);
      return {
        id: e.id,
        episodeId: e.id,
        decisionTitle: e.entityLabel ?? resp?.title ?? 'Escalated',
        entityType: e.entityType,
        entityId: e.entityId,
        entitySubtitle: null,
        agentKey: e.ownerAgentKey as AgentKey,
        agentName: agentNameByKey.get(e.ownerAgentKey) ?? e.ownerAgentKey,
        responsibilityKey: e.responsibilityKey,
        responsibilityTitle: resp?.title ?? e.responsibilityKey,
        priority: e.priority,
        status: e.status,
        openedAt: e.openedAt,
        requestedAt: e.openedAt,
        expiresAt: null,
        escalationReason: e.outcomeNote ?? null,
      };
    });
    return [...approvalRows, ...escalationRows].sort((a, b) => {
      const aTime = a.requestedAt ?? a.openedAt;
      const bTime = b.requestedAt ?? b.openedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [approvals.data, escalated.data, responsibilityIndex, agentNameByKey]);

  const filtered = useMemo(() => {
    let list = rows;
    if (handoffFilter !== HANDOFF_FILTERS.ALL) {
      list = list.filter((r) =>
        handoffFilter === HANDOFF_FILTERS.WAITING_APPROVAL ? r.status === 'WAITING_APPROVAL' : r.status === 'ESCALATED',
      );
    }
    if (agentFilter !== AGENT_FILTER_ALL) {
      list = list.filter((r) => r.agentKey === agentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) => r.decisionTitle.toLowerCase().includes(q) || r.responsibilityKey.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, handoffFilter, agentFilter, searchQuery]);

  const mineCount = (handoffCounts?.mine.waiting ?? 0) + (handoffCounts?.mine.escalated ?? 0);
  const allCount = (handoffCounts?.all.waiting ?? 0) + (handoffCounts?.all.escalated ?? 0);

  const isLoading = approvals.isLoading || escalated.isLoading;

  // Kind-filter counts (All / Waiting / Escalated chips above the list) —
  // always derived from the active scope's rows. Distinct from the Mine/All
  // *scope* counts (mineCount / allCount above), which come from the
  // tenant-wide aggregates in useHandoffCounts().
  const counts = useMemo(
    () => ({
      allKinds: rows.length,
      waitingApproval: rows.filter((r) => r.status === 'WAITING_APPROVAL').length,
      escalated: rows.filter((r) => r.status === 'ESCALATED').length,
    }),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <HandoffsScopeToggle scope={scope} onScopeChange={onScopeChange} mineCount={mineCount} allCount={allCount} />
          <span aria-hidden className="hidden h-5 w-px bg-border sm:inline-block" />
          <HandoffFilters counts={counts} agents={agents.data ?? []} />
        </div>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search entity or responsibility…"
          className="h-9 w-full sm:w-72"
        />
      </div>

      {isLoading ? (
        <HandoffsSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState scope={scope} hasAnyRows={rows.length > 0} onSwitchToAll={() => onScopeChange('all')} />
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <HandoffRowCard key={`${row.status}:${row.id}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function HandoffsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function EmptyState({
  scope,
  hasAnyRows,
  onSwitchToAll,
}: {
  scope: ApprovalScope;
  hasAnyRows: boolean;
  onSwitchToAll: () => void;
}) {
  if (scope === 'mine' && !hasAnyRows) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing needs you right now. Switch to{' '}
          <button
            type="button"
            onClick={onSwitchToAll}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            All
          </button>{' '}
          to see the rest of the team&apos;s handoffs.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        {hasAnyRows
          ? 'No handoffs match the current filters.'
          : 'Nothing needs you right now — Sally will queue things up as they come in.'}
      </p>
    </div>
  );
}
