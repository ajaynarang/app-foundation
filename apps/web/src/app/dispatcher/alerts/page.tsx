'use client';

import { useState, useMemo } from 'react';
import { BellOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import {
  PageHeader,
  PageTabs,
  PageTabsList,
  PageTabsTrigger,
  PageToolbar,
  TabsContent,
  FilterBar,
} from '@/shared/components/page-chrome';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { useGroupedAlerts } from '@/features/operations/alerts';
import { useAlertHistory } from '@/features/operations/alerts/hooks/use-alert-analytics';

import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { SmartStatsBar } from './components/SmartStatsBar';
import { GroupedAlertCard } from './components/GroupedAlertCard';
import { AlertBriefingSheet } from './components/AlertBriefingSheet';
import { DateRangeFilter } from '@/shared/components/ui/date-range-filter';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { AlertPriority } from '@sally/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getResponseTime(alert: any): string {
  if (!alert.acknowledgedAt) return '\u2014';
  const diff = new Date(alert.acknowledgedAt).getTime() - new Date(alert.createdAt).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const HISTORY_PRIORITY_BADGE: Record<string, 'destructive' | 'outline' | 'default'> = {
  critical: 'destructive',
  high: 'default',
  medium: 'outline',
  low: 'outline',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  return (
    <FeatureGuard featureKey="alerts">
      <div className="space-y-6">
        {/* Zone 1 — Header */}
        <PageHeader title="Alerts" subtitle="What needs your attention" hasTabs />

        {/* KPI row — metrics between Header and Toolbar (see page-chrome §15.4) */}
        <SmartStatsBar />

        {/* Tabs: Drivers | Loads | History */}
        <PageTabs defaultValue="drivers">
          <PageToolbar
            tabs={
              <PageTabsList>
                <PageTabsTrigger value="drivers">Drivers</PageTabsTrigger>
                <PageTabsTrigger value="loads">Loads</PageTabsTrigger>
                <PageTabsTrigger value="history">History</PageTabsTrigger>
              </PageTabsList>
            }
            primaryAction={<AlertBriefingSheet />}
          />

          <TabsContent value="drivers" className="mt-4">
            <GroupedAlertsView scope="driver" />
          </TabsContent>

          <TabsContent value="loads" className="mt-4">
            <GroupedAlertsView scope="load" />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryView />
          </TabsContent>
        </PageTabs>
      </div>
    </FeatureGuard>
  );
}

// ---------------------------------------------------------------------------
// Grouped Alerts View (used for both Drivers and Loads tabs)
// ---------------------------------------------------------------------------

function GroupedAlertsView({ scope }: { scope: 'driver' | 'load' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const params = priorityFilter !== 'all' ? { priority: priorityFilter } : undefined;
  const { data: groups = [], isLoading } = useGroupedAlerts(scope, params);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase();
    return groups.filter(
      (g) =>
        g.entityId.toLowerCase().includes(q) ||
        g.driverId?.toLowerCase().includes(q) ||
        g.loadId?.toLowerCase().includes(q) ||
        g.latestAlert.title.toLowerCase().includes(q),
    );
  }, [groups, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Filter bar (Zone 3) */}
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={scope === 'driver' ? 'Search by driver...' : 'Search by load...'}
        searchClassName="flex-1"
      >
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value={AlertPriority.CRITICAL}>Critical</SelectItem>
            <SelectItem value={AlertPriority.HIGH}>High</SelectItem>
            <SelectItem value={AlertPriority.MEDIUM}>Medium</SelectItem>
            <SelectItem value={AlertPriority.LOW}>Low</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Grouped alert cards */}
      {isLoading ? (
        <GroupedLoadingSkeleton />
      ) : filteredGroups.length === 0 ? (
        <EmptyState scope={scope} />
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => (
            <GroupedAlertCard key={group.entityId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History View (KEPT UNCHANGED from current page)
// ---------------------------------------------------------------------------

function HistoryView() {
  const { formatDateTime } = useFormatters();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [category, setCategory] = useState('all');
  const [priority, setPriority] = useState('all');
  const [status, setStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), limit: '20' };
    if (dateFrom) p.startDate = dateFrom;
    if (dateTo) p.endDate = dateTo;
    if (category !== 'all') p.category = category;
    if (priority !== 'all') p.priority = priority;
    if (status !== 'all') p.status = status;
    if (searchQuery.trim()) p.driverId = searchQuery.trim();
    return p;
  }, [page, dateFrom, dateTo, category, priority, status, searchQuery]);

  const { data, isLoading } = useAlertHistory(params);

  const handleReset = () => {
    setPage(1);
    setDateFrom(undefined);
    setDateTo(undefined);
    setSearchQuery('');
    setCategory('all');
    setPriority('all');
    setStatus('all');
  };

  return (
    <div className="space-y-4">
      {/* Filter bar (Zone 3) — single row: search · date · category · priority · status · reset */}
      <FilterBar
        searchValue={searchQuery}
        onSearchChange={(v) => {
          setSearchQuery(v);
          setPage(1);
        }}
        searchPlaceholder="Search alerts..."
        searchClassName="flex-1 min-w-[200px]"
      >
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="7d"
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
            setPage(1);
          }}
        />
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="compliance">Compliance</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="safety">Safety</SelectItem>
            <SelectItem value="route">Route</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={priority}
          onValueChange={(v) => {
            setPriority(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value={AlertPriority.CRITICAL}>Critical</SelectItem>
            <SelectItem value={AlertPriority.HIGH}>High</SelectItem>
            <SelectItem value={AlertPriority.MEDIUM}>Medium</SelectItem>
            <SelectItem value={AlertPriority.LOW}>Low</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="AUTO_RESOLVED">Auto-resolved</SelectItem>
            <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleReset}>
          Reset
        </Button>
      </FilterBar>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="hidden lg:table-cell">Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4 mx-auto" />
                        <Skeleton className="h-4 w-1/2 mx-auto" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : data?.items?.length ? (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data.items.map((alert: any) => (
                    <TableRow key={alert.alertId}>
                      <TableCell className="text-sm whitespace-nowrap">{formatDateTime(alert.createdAt)}</TableCell>
                      <TableCell className="text-xs font-mono max-w-[150px] truncate">{alert.alertType}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="capitalize text-xs">
                          {alert.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={HISTORY_PRIORITY_BADGE[alert.priority] || 'outline'}
                          className="capitalize text-xs"
                        >
                          {alert.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{alert.driverId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {alert.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground">
                        {getResponseTime(alert)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No alerts found matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ scope }: { scope: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <BellOff className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="font-semibold text-foreground">No {scope === 'driver' ? 'driver' : 'load'} alerts</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {scope === 'driver'
            ? 'No active driver-related alerts at this time.'
            : 'No active load-related alerts at this time.'}
        </p>
      </CardContent>
    </Card>
  );
}

function GroupedLoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-16 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
