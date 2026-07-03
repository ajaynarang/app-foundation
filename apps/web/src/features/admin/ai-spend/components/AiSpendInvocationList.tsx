'use client';

import { ExternalLink } from 'lucide-react';

import { AiInvocationStatus } from '@app/shared-types';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';

import { formatRelativeTime, formatUsdPrecise } from '@appshore/web-core/shared/lib/utils/formatters';

import { useAiSpendInvocations } from '../hooks';
import { SURFACE_LABELS, getLangfuseTraceUrl, getLangfuseSessionUrl, buildLangfuseSessionId } from '../constants';
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
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAiSpendInvocations(
    tenantId,
    surface,
    true,
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm py-6 text-center">No AI invocations in this window.</p>;
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
            const surfaceMeta = SURFACE_LABELS[row.surface as AiSurface];
            // Prefer a direct trace link when the id is present; otherwise fall
            // back to the session-filtered Langfuse view, which is always
            // derivable from the row (langfuseTraceId is not yet populated).
            const sessionId = buildLangfuseSessionId({ ...row, tenantId });
            const traceUrl = getLangfuseTraceUrl(row.langfuseTraceId) ?? getLangfuseSessionUrl(sessionId);
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant="outline" className={surfaceMeta?.className}>
                    {surfaceMeta?.label ?? row.surface}
                  </Badge>
                  {row.status !== AiInvocationStatus.OK && (
                    <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-500">
                      {row.status}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-xs">{row.model}</TableCell>
                <TableCell className="text-right tabular-nums">{formatInvocationCost(row.costUsd)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground">
                  {(row.promptTokens + row.completionTokens).toLocaleString()}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                  {formatRelativeTime(row.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {traceUrl ? (
                    <a
                      href={traceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
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

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
