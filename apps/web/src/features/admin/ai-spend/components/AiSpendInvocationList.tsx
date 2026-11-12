'use client';

import { ExternalLink } from 'lucide-react';

import { AiInvocationStatus } from '@app/shared-types';
import { Badge } from '@app/ui/components/ui/badge';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';

import { formatUsdPrecise } from '@appshore/web-core/shared/lib/utils/formatters';

import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  RelativeTime,
} from '@/shared/components/page-chrome';

import { useAiSpendInvocations } from '../hooks';
import {
  INVOCATION_STATUS_VARIANTS,
  SURFACE_LABELS,
  getLangfuseTraceUrl,
  getLangfuseSessionUrl,
  buildLangfuseSessionId,
} from '../constants';
import type { AiSurface } from '../types';

interface AiSpendInvocationListProps {
  tenantId: number;
  surface?: string;
}

// Per-invocation cost is often sub-cent; show 4 fraction digits.
function formatInvocationCost(value: string | null): string {
  if (value == null) return '—';
  return formatUsdPrecise(value, 4);
}

export function AiSpendInvocationList({ tenantId, surface }: AiSpendInvocationListProps) {
  const list = useAiSpendInvocations(tenantId, surface, true);
  const { items, isLoading } = list;

  if (isLoading) return <PageLoadingSkeleton variant="table" rows={6} />;

  if (list.isError) {
    return (
      <ListErrorState
        title="Couldn't load the invocations."
        error={list.error}
        onRetry={() => void list.refetch()}
        isRetrying={list.isRefetching}
      />
    );
  }

  if (items.length === 0) {
    return (
      <PageEmptyState title="No AI calls in this window" description="Calls show here as this tenant makes them." />
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Surface</TableHead>
            <TableHead className="hidden md:table-cell">Model</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Tokens</TableHead>
            <TableHead className="hidden lg:table-cell">When</TableHead>
            <TableHead className="text-right">Trace</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => {
            const surfaceLabel = SURFACE_LABELS[row.surface as AiSurface];
            const outcome = INVOCATION_STATUS_VARIANTS[row.status as AiInvocationStatus];
            // Prefer a direct trace link when the id is present; otherwise fall
            // back to the session-filtered Langfuse view, which is always
            // derivable from the row (langfuseTraceId is not yet populated).
            const sessionId = buildLangfuseSessionId({ ...row, tenantId });
            const traceUrl = getLangfuseTraceUrl(row.langfuseTraceId) ?? getLangfuseSessionUrl(sessionId);
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant="outline">{surfaceLabel ?? row.surface}</Badge>
                  {row.status !== AiInvocationStatus.OK && (
                    <StatusBadge tone={outcome?.tone ?? 'danger'} className="ml-2">
                      {outcome?.label ?? row.status}
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{row.model}</TableCell>
                <TableCell className="text-right tabular-nums">{formatInvocationCost(row.costUsd)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">
                  {(row.promptTokens + row.completionTokens).toLocaleString()}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                  <RelativeTime iso={row.createdAt} />
                </TableCell>
                <TableCell className="text-right">
                  {traceUrl ? (
                    <a
                      href={traceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-info-text hover:underline"
                      aria-label="Open trace"
                    >
                      Trace <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ListFooter
        shown={items.length}
        total={list.total}
        hasMore={list.hasMore}
        onLoadMore={list.loadMore}
        isLoadingMore={list.isLoadingMore}
        loadMoreFailed={list.isLoadMoreError}
      />
    </div>
  );
}
