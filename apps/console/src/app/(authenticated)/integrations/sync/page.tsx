'use client';

import { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@app/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { useSyncHistory, useIntegrations } from '../../../../hooks/use-integrations';
import { ConsoleFeatureGuard } from '@/components/feature-guard';

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
  const { data: syncLogs, isLoading: syncLoading } = useSyncHistory();
  const { isLoading: integrationsLoading } = useIntegrations();
  const [syncTypeFilter, setSyncTypeFilter] = useState<string>('all');

  const isLoading = syncLoading || integrationsLoading;

  const syncTypes = useMemo(() => {
    if (!syncLogs) return [];
    const types = new Set(syncLogs.map((log) => log.syncType));
    return Array.from(types).sort();
  }, [syncLogs]);

  const filteredLogs = useMemo(() => {
    if (!syncLogs) return [];
    if (syncTypeFilter === 'all') return syncLogs;
    return syncLogs.filter((log) => log.syncType === syncTypeFilter);
  }, [syncLogs, syncTypeFilter]);

  const stats = useMemo(() => {
    if (!syncLogs || syncLogs.length === 0) return { total: 0, successRate: 0, lastSync: null };
    const successCount = syncLogs.filter((log) => log.status === 'success').length;
    const sorted = [...syncLogs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return {
      total: syncLogs.length,
      successRate: syncLogs.length > 0 ? Math.round((successCount / syncLogs.length) * 100) : 0,
      lastSync: sorted[0]?.startedAt ?? null,
    };
  }, [syncLogs]);

  return (
    <ConsoleFeatureGuard entitlementKey="samsara_integration">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sync Status</h1>
          <p className="text-muted-foreground mt-1">Monitor data synchronization across your integrations.</p>
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
          <h2 className="text-lg font-semibold text-foreground">Recent Sync Logs</h2>
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
        ) : filteredLogs.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <svg
                  className="h-8 w-8 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                  />
                </svg>
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
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="border-border">
                    <TableCell className="font-medium text-foreground">{log.syncType}</TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="text-right text-foreground">{log.recordsProcessed}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          log.recordsFailed > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'
                        }
                      >
                        {log.recordsFailed}
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
    </ConsoleFeatureGuard>
  );
}
