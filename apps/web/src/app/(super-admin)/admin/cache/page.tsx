'use client';

import { useAuthStore } from '@/features/auth';
import { useCacheHealth, useCacheStats, useFlushNamespace, useFlushAll } from '@/features/platform/cache-management';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sally/ui/components/ui/alert-dialog';
import { Database, XCircle, Activity, HardDrive, Clock, Server, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

/** Human-readable names for cache namespace keys. */
/** Maps backend namespace keys to human-readable labels. Must match CACHE_NAMESPACES in cache.constants.ts */
const NAMESPACE_LABELS: Record<string, string> = {
  'sally:plans': 'Plans & Entitlements',
  'sally:addons': 'Add-Ons',
  'sally:cmdcenter': 'Command Center',
  'sally:analytics': 'KPI Dashboard',
  'sally:alerts': 'Alerts',
  'sally:eld': 'ELD / Telematics',
  'sally:health': 'Platform Health',
  'sally:oauth': 'OAuth Tokens',
  'sally:loadboard': 'Load Board',
  'sally:flags': 'Feature Flags',
  'sally:dispatch': 'Dispatch Board',
  'sally:profitability': 'Profitability',
  'sally:prefs': 'User Preferences',
  'sally:onboarding': 'Onboarding',
  'sally:closeout': 'Close-Out',
  'sally:invoicing': 'Invoicing',
  'sally:shield': 'Shield Compliance',
  'sally:notifications': 'Notifications',
  'sally:settings': 'Settings',
  'sally:reference': 'Reference Data',
  'sally:monitoring': 'Monitoring',
  'sally:loads': 'Loads',
  'sally:tenants': 'Tenants',
  'sally:announcements': 'Announcements',
  'sally:customers': 'Customers',
};

function getNamespaceLabel(namespace: string): string {
  return NAMESPACE_LABELS[namespace] || namespace;
}

function computeHitRate(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) return 0;
  return (hits / total) * 100;
}

function getHitRateColor(rate: number): string {
  if (rate >= 95) return 'text-emerald-500';
  if (rate >= 80) return 'text-blue-500';
  return 'text-orange-500';
}

/** Skeleton that matches the page layout during initial load. */
function CachePageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table skeleton */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 mt-1" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <div className="flex gap-8">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CacheManagementPage() {
  const { isAuthenticated, user } = useAuthStore();
  const { data: health, isLoading: healthLoading } = useCacheHealth();
  const { data: stats, isLoading: statsLoading } = useCacheStats();
  const flushMutation = useFlushNamespace();
  const flushAllMutation = useFlushAll();
  const [flushDialogOpen, setFlushDialogOpen] = useState(false);

  // Access control — SUPER_ADMIN only
  if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-critical mx-auto mb-4" />
            <p className="text-lg font-semibold text-foreground">Access Denied</p>
            <p className="text-sm text-muted-foreground mt-2">Only super admins can manage the cache</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show skeleton until all data is ready for a clean initial render
  if (healthLoading || statsLoading) {
    return <CachePageSkeleton />;
  }

  const isConnected = health?.status === 'connected';
  const backend = health?.backend ?? 'redis';
  const namespaces = stats?.namespaces ?? [];
  const metrics = stats?.metrics ?? {};
  const keyCounts = stats?.keyCounts ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Database className="h-8 w-8" />
          Cache Management
        </h1>
        <p className="text-muted-foreground mt-1">Manage Redis cache health and namespaces</p>
      </div>

      {/* Health stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <div className="space-y-2">
                {isConnected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">Connected</Badge>
                ) : (
                  <Badge variant="destructive">Unavailable</Badge>
                )}
                <p className="text-xs text-muted-foreground">
                  Backend:{' '}
                  {backend === 'redis' ? (
                    <span className="text-emerald-500 font-medium">Redis</span>
                  ) : (
                    <span className="text-amber-500 font-medium">In-Memory (degraded)</span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Memory Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{health?.memoryUsed ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">Peak: {health?.memoryPeak ?? '—'}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{health?.uptime ?? '—'}</p>
            )}
          </CardContent>
        </Card>

        {/* Version */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Redis Version</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground">{health?.redisVersion ?? '—'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {health?.totalKeys ?? '0'} total keys &middot; {health?.connectedClients ?? '0'} clients
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Namespace metrics table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Cache Namespace Metrics</CardTitle>
              <CardDescription>Hit/miss rates per namespace with flush controls</CardDescription>
            </div>
            <AlertDialog open={flushDialogOpen} onOpenChange={setFlushDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={namespaces.length === 0}>
                  Flush All Caches
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Flush all caches?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all cached data across all namespaces. Caches will repopulate on next request, but
                    expect a brief increase in database load.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={flushAllMutation.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      flushAllMutation.mutate(undefined, {
                        onSettled: () => setFlushDialogOpen(false),
                      });
                    }}
                    disabled={flushAllMutation.isPending}
                  >
                    {flushAllMutation.isPending ? 'Flushing...' : 'Flush All'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <div className="flex gap-8">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : namespaces.length === 0 ? (
            <div className="text-center py-8">
              <Database className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No cache namespaces found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Namespace</TableHead>
                    <TableHead className="text-right">Keys</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Misses</TableHead>
                    <TableHead className="text-right">Hit Rate</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {namespaces.map((namespace) => {
                    const m = metrics[namespace] ?? { hits: 0, misses: 0 };
                    const keyCount = keyCounts[namespace] ?? 0;
                    const rate = computeHitRate(m.hits, m.misses);
                    const rateColor = getHitRateColor(rate);
                    const isFlushing = flushMutation.isPending && flushMutation.variables === namespace;

                    return (
                      <TableRow key={namespace}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{getNamespaceLabel(namespace)}</p>
                            <p className="text-xs text-muted-foreground">{namespace}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-foreground">
                          {keyCount === 0 ? (
                            <span className="text-muted-foreground">0</span>
                          ) : (
                            keyCount.toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-foreground">
                          {m.hits.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-foreground">
                          {m.misses.toLocaleString()}
                        </TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${rateColor}`}>
                          {rate.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            loading={isFlushing}
                            disabled={keyCount === 0}
                            onClick={() => flushMutation.mutate(namespace)}
                          >
                            Flush
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-caution/20">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-caution mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-caution">Important Notes</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Flushing a namespace deletes all cached data for that scope</li>
                <li>
                  Caches repopulate automatically on the next request, but expect a brief increase in database load
                </li>
                <li>Hit rate metrics reset when the Redis server restarts</li>
                <li>Health data refreshes every 30 seconds; metrics every 15 seconds</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
