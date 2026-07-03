'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';

import { formatRelativeTime, formatUsdPrecise } from '@appshore/web-core/shared/lib/utils/formatters';

import { useAiSpendTenants } from '../hooks';
import { WINDOW_OPTIONS } from '../constants';
import type { AiSpendTenantSummary } from '../types';
import { AiSpendSparkline } from './AiSpendSparkline';
import { AiSpendDetailSheet } from './AiSpendDetailSheet';

export function AiSpendPage() {
  const [days, setDays] = useState<number>(7);
  const [selected, setSelected] = useState<AiSpendTenantSummary | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, isLoading, isError } = useAiSpendTenants(days);

  const totalSpend = useMemo(() => {
    if (!data) return 0;
    return data.reduce((sum, t) => sum + parseFloat(t.windowCostUsd), 0);
  }, [data]);

  const handleOpen = (tenant: AiSpendTenantSummary) => {
    setSelected(tenant);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">AI Spend</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            What every account is costing us — across chat, desk, and document AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOW_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={days === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {!isLoading && !isError && data && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total across {data.length} tenants</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{formatUsdPrecise(totalSpend)}</p>
        </div>
      )}

      {isError && <p className="text-sm text-red-500 py-6 text-center">Failed to load AI spend. Please retry.</p>}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead className="text-right">{days}d Cost</TableHead>
              <TableHead className="hidden sm:table-cell text-center">Trend</TableHead>
              <TableHead className="hidden md:table-cell text-right">Calls</TableHead>
              <TableHead className="hidden lg:table-cell">Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((tenant) => (
              <TableRow
                key={tenant.tenantId}
                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => handleOpen(tenant)}
              >
                <TableCell>
                  <div className="font-medium text-foreground">{tenant.companyName}</div>
                  <div className="text-xs text-muted-foreground">{tenant.tenantSlug}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatUsdPrecise(tenant.windowCostUsd)}
                  {tenant.windowErrorCount > 0 && (
                    <Badge variant="outline" className="ml-2 bg-red-500/10 text-red-500">
                      {tenant.windowErrorCount} err
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                  <div className="flex justify-center">
                    <AiSpendSparkline points={tenant.sparkline} />
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                  {tenant.windowCallCount.toLocaleString()}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                  {tenant.lastActivityAt ? formatRelativeTime(tenant.lastActivityAt) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        !isError && (
          <p className="text-muted-foreground text-sm py-10 text-center">No AI spend recorded yet in this window.</p>
        )
      )}

      <AiSpendDetailSheet tenant={selected} days={days} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
