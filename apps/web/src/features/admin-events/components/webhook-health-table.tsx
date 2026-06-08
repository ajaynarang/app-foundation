'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { useWebhookHealth } from '../use-admin-events';
import type { WebhookHealthEntry } from '../api';

function HealthRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-14" />
      </TableCell>
    </TableRow>
  );
}

function getRateBadge(rate: number) {
  if (rate >= 95) {
    return (
      <Badge variant="muted" className="font-mono">
        {rate.toFixed(1)}%
      </Badge>
    );
  }
  if (rate >= 50) {
    return (
      <Badge
        variant="muted"
        className="font-mono bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
      >
        {rate.toFixed(1)}%
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="font-mono">
      {rate.toFixed(1)}%
    </Badge>
  );
}

export function WebhookHealthTable() {
  const { data, isLoading } = useWebhookHealth();

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead className="text-right">Total Deliveries</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Success Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <HealthRowSkeleton key={i} />)
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                  No webhook delivery data available
                </TableCell>
              </TableRow>
            ) : (
              data.map((entry: WebhookHealthEntry) => (
                <TableRow
                  key={entry.tenantId}
                  className={entry.successRate < 50 ? 'bg-red-500/5 dark:bg-red-500/10' : ''}
                >
                  <TableCell className="font-mono text-sm">{entry.tenantId}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.total.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.delivered.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{entry.failed.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{getRateBadge(entry.successRate)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
