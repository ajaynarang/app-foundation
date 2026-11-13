'use client';

import { useState } from 'react';

import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';

import { formatUsdPrecise } from '@appshore/web-core/shared/lib/utils/formatters';

import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageHeader,
  PageLoadingSkeleton,
  RelativeTime,
  SegmentedControl,
} from '@/shared/components/page-chrome';

import { useAiSpendSummary, useAiSpendTenants } from '../hooks';
import { WINDOW_OPTIONS } from '../constants';
import type { AiSpendTenantSummary } from '../types';
import { AiSpendSparkline } from './AiSpendSparkline';
import { AiSpendDetailSheet } from './AiSpendDetailSheet';

export function AiSpendPage() {
  const [days, setDays] = useState<number>(7);
  const [selected, setSelected] = useState<AiSpendTenantSummary | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const tenants = useAiSpendTenants(days);
  const { items: data, isLoading, isError } = tenants;
  const windowValue = String(days) as (typeof WINDOW_OPTIONS)[number]['value'];
  // The total comes from the server: summing the loaded page would under-report once there is a second page.
  const summary = useAiSpendSummary(days);

  const handleOpen = (tenant: AiSpendTenantSummary) => {
    setSelected(tenant);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Spend"
        subtitle="What every account is costing us, across chat, desk, and document AI"
        actions={
          <SegmentedControl
            label="Spend window"
            options={[...WINDOW_OPTIONS]}
            value={windowValue}
            onChange={(value) => setDays(Number(value))}
          />
        }
      />

      {summary.data && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total across {summary.data.tenantCount} tenants</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {formatUsdPrecise(summary.data.windowCostUsd)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatUsdPrecise(summary.data.windowPlatformCostUsd)} paid by the platform; the rest on workspaces&apos;
            own keys
          </p>
        </div>
      )}

      {isError ? (
        <ListErrorState
          title="Couldn't load AI spend."
          error={tenants.error}
          onRetry={() => void tenants.refetch()}
          isRetrying={tenants.isRefetching}
        />
      ) : isLoading ? (
        <PageLoadingSkeleton variant="table" rows={8} />
      ) : data.length > 0 ? (
        <div className="space-y-3">
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
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleOpen(tenant)}
                >
                  <TableCell>
                    <div className="font-medium text-foreground">{tenant.companyName}</div>
                    <div className="text-xs text-muted-foreground">{tenant.tenantSlug}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatUsdPrecise(tenant.windowCostUsd)}
                    {tenant.windowPlatformCostUsd !== tenant.windowCostUsd && (
                      <div className="text-xs font-normal text-muted-foreground">
                        {formatUsdPrecise(tenant.windowPlatformCostUsd)} platform
                      </div>
                    )}
                    {tenant.windowErrorCount > 0 && (
                      <StatusBadge tone="danger" className="ml-2">
                        {tenant.windowErrorCount} err
                      </StatusBadge>
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
                    {tenant.lastActivityAt ? <RelativeTime iso={tenant.lastActivityAt} /> : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListFooter
            shown={data.length}
            total={tenants.total}
            hasMore={tenants.hasMore}
            onLoadMore={tenants.loadMore}
            isLoadingMore={tenants.isLoadingMore}
            loadMoreFailed={tenants.isLoadMoreError}
          />
        </div>
      ) : (
        <PageEmptyState title="No AI spend in this window" description="Spend shows here once a tenant uses AI." />
      )}

      <AiSpendDetailSheet tenant={selected} days={days} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
