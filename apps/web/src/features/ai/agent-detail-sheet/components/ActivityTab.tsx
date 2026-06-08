'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import type { AgentActivityFilter, AgentActivityRow, AgentPrincipalKind } from '@app/shared-types';
import { useAgentActivity } from '@/features/ai/agent-activity';
import { ScopeChip } from '@/features/ai/agent-scope-ui';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';

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

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function tierBadgeVariant(tier: 'none' | 'standard' | 'sensitive'): 'muted' | 'info' | 'caution' {
  if (tier === 'sensitive') return 'caution';
  if (tier === 'standard') return 'info';
  return 'muted';
}

export function ActivityTab({ principalKind, principalId }: ActivityTabProps) {
  const [filter, setFilter] = useState<AgentActivityFilter>('all');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAgentActivity({
    principalKind,
    principalId,
    filter,
    dateFrom,
    dateTo,
  });

  const rows: AgentActivityRow[] = data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1" role="tablist" aria-label="Activity filter">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? 'default' : 'outline'}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
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
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {dateFrom || dateTo
              ? 'No activity in this date range. Try widening the window.'
              : 'No activity yet. Invocations will appear here once this agent starts making calls.'}
          </p>
        </div>
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
                  <TableCell className="whitespace-nowrap" title={r.createdAt}>
                    {formatRelative(r.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.toolName}</TableCell>
                  <TableCell>
                    <ScopeChip scope={r.scopeRequired} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={tierBadgeVariant(r.hitlTier)}>{r.hitlTier}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.success ? <Badge variant="info">ok</Badge> : <Badge variant="critical">failed</Badge>}
                    {r.confirmationTokenId && (
                      <Badge variant="muted" className="ml-1">
                        approval
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
