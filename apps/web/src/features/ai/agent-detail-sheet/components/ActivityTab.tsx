'use client';

import { useState } from 'react';
import { Badge } from '@app/ui/components/ui/badge';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import type { AgentActivityFilter, AgentActivityRow, AgentPrincipalKind } from '@app/shared-types';
import { useAgentActivity } from '@/features/ai/agent-activity';
import { HITL_TIER_VARIANTS, ScopeChip } from '@/features/ai/agent-scope-ui';
import { DateRangeFilter, HISTORY_PRESETS } from '@app/ui/components/ui/date-range-filter';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  RelativeTime,
  SegmentedControl,
} from '@/shared/components/page-chrome';

interface ActivityTabProps {
  principalKind: AgentPrincipalKind;
  /**
   * Wire-format principal id used to query `agent_invocation_logs`. For api_key
   * principals this is the stringified numeric DB id; for oauth_client principals
   * it is the string clientId. Callers stringify before passing.
   */
  principalId: string;
}

const FILTERS: Array<{ value: AgentActivityFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'tool_calls', label: 'Tool calls' },
  { value: 'approvals', label: 'Approvals' },
];

export function ActivityTab({ principalKind, principalId }: ActivityTabProps) {
  const [filter, setFilter] = useState<AgentActivityFilter>('all');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const activity = useAgentActivity({
    principalKind,
    principalId,
    filter,
    dateFrom,
    dateTo,
  });
  const { isLoading } = activity;
  const rows: AgentActivityRow[] = activity.items;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SegmentedControl label="Activity filter" options={FILTERS} value={filter} onChange={setFilter} />
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="today"
          presets={HISTORY_PRESETS}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>

      {isLoading ? (
        <PageLoadingSkeleton variant="table" rows={6} />
      ) : activity.isError ? (
        <ListErrorState
          title="Couldn't load this agent's activity."
          error={activity.error}
          onRetry={() => void activity.refetch()}
          isRetrying={activity.isRefetching}
        />
      ) : rows.length === 0 ? (
        <PageEmptyState
          title={dateFrom || dateTo ? 'No activity in this date range' : 'No activity yet'}
          description={
            dateFrom || dateTo
              ? 'Try widening the window.'
              : 'Invocations will appear here once this agent starts making calls.'
          }
        />
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    <RelativeTime iso={r.createdAt} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.toolName}</TableCell>
                  <TableCell>
                    <ScopeChip scope={r.scopeRequired} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={HITL_TIER_VARIANTS[r.hitlTier].tone}>
                      {HITL_TIER_VARIANTS[r.hitlTier].label}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {r.success ? (
                      <StatusBadge tone="success">Succeeded</StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">Failed</StatusBadge>
                    )}
                    {r.confirmationTokenId && (
                      <Badge variant="outline" className="ml-1">
                        Approved by a person
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length > 0 && (
        <ListFooter
          shown={rows.length}
          total={activity.total}
          hasMore={activity.hasMore}
          onLoadMore={activity.loadMore}
          isLoadingMore={activity.isLoadingMore}
          loadMoreFailed={activity.isLoadMoreError}
        />
      )}
    </div>
  );
}
