'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@sally/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getUnifiedSyncHistory } from '@/features/integrations/api';
import type { UnifiedSyncHistoryResponse } from '@/features/integrations/api';

function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return 'Running...';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  if (diffMs < 1000) return `${diffMs}ms`;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${mins}m ${secs}s`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent">
          Success
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-transparent">
          Failed
        </Badge>
      );
    case 'running':
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-transparent">
          Running
        </Badge>
      );
    default:
      return <Badge variant="muted">{status}</Badge>;
  }
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-card border-border">
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead>Sync Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Processed</TableHead>
            <TableHead>Failed</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i} className="border-border">
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-14" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function SyncStatusPage() {
  const [syncTypeFilter, setSyncTypeFilter] = useState<string>('all');

  const { data: syncResponse, isLoading } = useQuery<UnifiedSyncHistoryResponse>({
    queryKey: ['sync-history', syncTypeFilter],
    queryFn: () => getUnifiedSyncHistory(50, 0, syncTypeFilter === 'all' ? undefined : syncTypeFilter),
  });

  const syncItems = syncResponse?.items;
  const syncLogs = useMemo(() => syncItems ?? [], [syncItems]);

  const syncTypes = useMemo(() => {
    if (!syncLogs.length) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const types = new Set(syncLogs.map((log: any) => log.syncType));
    return Array.from(types).sort() as string[];
  }, [syncLogs]);

  const stats = useMemo(() => {
    if (!syncLogs.length) return { total: 0, successRate: 0, lastSync: null as string | null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const successCount = syncLogs.filter((log: any) => log.status === 'success').length;
    const sorted = [...syncLogs].sort(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
    return {
      total: syncLogs.length,
      successRate: Math.round((successCount / syncLogs.length) * 100),
      lastSync: sorted[0]?.startedAt ?? null,
    };
  }, [syncLogs]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Sync Status</h2>
        <p className="text-sm text-muted-foreground">Is everything in sync? Check here</p>
      </div>

      {isLoading ? (
        <SummarySkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Syncs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{stats.successRate}%</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Last Sync</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {stats.lastSync ? formatDateTime(stats.lastSync) : 'Never'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Recent Sync Logs</h3>
        {syncTypes.length > 0 && (
          <Select value={syncTypeFilter} onValueChange={setSyncTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {syncTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : syncLogs.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <RefreshCw className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No sync history</h3>
            <p className="text-muted-foreground max-w-sm">
              {syncTypeFilter !== 'all'
                ? `No sync logs found for type "${syncTypeFilter}". Try selecting a different filter.`
                : 'Sync logs will appear here once your integrations start syncing data.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Sync Type</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground text-right">Processed</TableHead>
                <TableHead className="text-muted-foreground text-right">Failed</TableHead>
                <TableHead className="text-muted-foreground">Started</TableHead>
                <TableHead className="text-muted-foreground">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {syncLogs.map((log: any) => (
                <TableRow key={log.id} className="border-border">
                  <TableCell className="font-medium text-foreground">{log.syncType}</TableCell>
                  <TableCell>
                    <StatusBadge status={log.status} />
                  </TableCell>
                  <TableCell className="text-right text-foreground">{log.recordsProcessed ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        (log.recordsFailed ?? 0) > 0
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : 'text-muted-foreground'
                      }
                    >
                      {log.recordsFailed ?? 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(log.startedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDuration(log.startedAt, log.completedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
