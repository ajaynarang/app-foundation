'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { useAdminEvents, useTenantList } from '../use-admin-events';
import type { DomainEventLogEntry } from '../api';

const PAGE_SIZE = 25;

const ACTOR_TYPES = ['user', 'integration', 'system', 'api-key'] as const;

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function EventRowSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-4 w-28" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
    </TableRow>
  );
}

function ExpandedPayload({ data }: { data: any }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="bg-muted/50 p-0">
        <pre className="p-4 text-xs text-muted-foreground overflow-x-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      </TableCell>
    </TableRow>
  );
}

export function EventStreamTable() {
  const [search, setSearch] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [actorType, setActorType] = useState('');
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [offset, setOffset] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDateChange = useCallback((from: string | undefined, to: string | undefined) => {
    setDateFrom(from);
    setDateTo(to);
    setOffset(0);
  }, []);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      tenant: tenantId || undefined,
      actorType: actorType || undefined,
      since: dateFrom,
      until: dateTo,
      limit: PAGE_SIZE,
      offset,
    }),
    [search, tenantId, actorType, dateFrom, dateTo, offset],
  );

  const { data, isLoading } = useAdminEvents(filters, { autoRefresh });
  const { data: tenants } = useTenantList();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search event, entity, actor..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            className="pl-8"
          />
        </div>

        <Select
          value={tenantId || 'all'}
          onValueChange={(v) => {
            setTenantId(v === 'all' ? '' : v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tenants</SelectItem>
            {(tenants ?? []).map((t: any) => (
              <SelectItem key={t.tenantId} value={t.tenantId}>
                {t.companyName || t.tenantId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={actorType}
          onValueChange={(v) => {
            setActorType(v === 'all' ? '' : v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="All actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {ACTOR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="7d"
          presets={HISTORY_PRESETS}
          onChange={handleDateChange}
        />

        <Button
          variant={autoRefresh ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAutoRefresh((v) => !v)}
          className="ml-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? 'animate-spin' : ''}`} />
          {autoRefresh ? 'Live' : 'Auto-refresh'}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Timestamp</TableHead>
              <TableHead className="w-24">Tenant</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="w-36">Actor</TableHead>
              <TableHead className="w-32">Entity ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <EventRowSkeleton key={i} />)
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                  No events found
                </TableCell>
              </TableRow>
            ) : (
              items.map((entry: DomainEventLogEntry) => {
                const isExpanded = expandedId === entry.id;
                return (
                  <EventRow
                    key={entry.id}
                    entry={entry}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : entry.id)}
                  />
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total > 0 ? `Showing ${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}` : 'No results'}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function EventRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: DomainEventLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            {formatTimestamp(entry.createdAt)}
          </span>
        </TableCell>
        <TableCell className="font-mono text-xs">{entry.tenantId}</TableCell>
        <TableCell>
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="muted" className="font-mono text-xs">
              {entry.event}
            </Badge>
            <Badge
              variant={entry.visibility === 'internal' ? 'outline' : 'default'}
              className={`text-[10px] px-1.5 py-0 ${
                entry.visibility === 'internal'
                  ? 'text-muted-foreground'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              }`}
            >
              {entry.visibility === 'internal' ? 'INT' : 'EXT'}
            </Badge>
          </span>
        </TableCell>
        <TableCell className="text-xs">
          {entry.actorType && (
            <span className="text-muted-foreground">
              {entry.actorType}
              {entry.actorLabel ? `: ${entry.actorLabel}` : ''}
            </span>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[8rem]">
          {entry.aggregateId ?? '-'}
        </TableCell>
      </TableRow>
      {isExpanded && <ExpandedPayload data={entry.data} />}
    </>
  );
}
