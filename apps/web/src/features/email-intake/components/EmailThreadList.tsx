'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { StatusPivot } from '@/shared/components/page-chrome';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';
import type { StatusPivotSegment } from '@/shared/components/page-chrome';
import { useEmailThreads } from '../hooks/use-email-threads';
import { useArchiveThreads } from '../hooks/use-archive-threads';
import { useEmailIntakeSettings } from '../hooks/use-email-intake-settings';
import { EmailThreadRow } from './EmailThreadRow';
import { EmailImportSheet } from './EmailImportSheet';
import { EmailInboxEmptyState } from './EmailInboxEmptyState';
import type { EmailIngestThread } from '../types';

type ViewTab = 'PENDING' | 'ARCHIVE';

const VIEW_TABS: StatusPivotSegment<ViewTab>[] = [
  { value: 'PENDING', label: 'Pending', dot: 'bg-caution' },
  { value: 'ARCHIVE', label: 'Archive' },
];

const DEFAULT_RANGE = HISTORY_PRESETS.find((p) => p.value === '7d')?.getRange();

export function EmailThreadList() {
  const [activeTab, setActiveTab] = useState<ViewTab>('PENDING');
  const [selectedThread, setSelectedThread] = useState<EmailIngestThread | null>(null);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | undefined>(DEFAULT_RANGE?.from);
  const [dateTo, setDateTo] = useState<string | undefined>(DEFAULT_RANGE?.to);

  const pendingParams = useMemo(() => {
    const p: Record<string, string> = { status: 'PENDING' };
    if (dateFrom) p.from = dateFrom;
    if (dateTo) p.to = dateTo;
    return p;
  }, [dateFrom, dateTo]);

  const isPendingView = activeTab === 'PENDING';

  const pending = useEmailThreads(isPendingView ? pendingParams : undefined);
  const archive = useArchiveThreads(isPendingView ? {} : { from: dateFrom, to: dateTo });

  const isLoading = isPendingView ? pending.isLoading : archive.isLoading;
  const rawList = isPendingView ? (pending.data?.data ?? []) : archive.data.data;
  const totalCount = isPendingView ? (pending.data?.total ?? 0) : archive.data.total;

  const { data: settings } = useEmailIntakeSettings();

  const threads = useMemo(() => {
    const sorted = [...rawList].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!search.trim()) return sorted;
    const term = search.trim().toLowerCase();
    return sorted.filter((t) => t.senderEmail.toLowerCase().includes(term) || t.subject.toLowerCase().includes(term));
  }, [rawList, search]);

  const handleRowClick = (thread: EmailIngestThread) => {
    setSelectedThread(thread);
    setImportSheetOpen(true);
  };

  const handleSheetOpenChange = (open: boolean) => {
    setImportSheetOpen(open);
    if (!open) setSelectedThread(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-9 w-72 rounded-md" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Filter bar (Zone 3): Pending/Archive status pivot · count · search · date — one row */}
      <div className="flex flex-col gap-3 px-4 py-2 lg:flex-row lg:items-center lg:justify-between">
        <StatusPivot
          value={activeTab}
          onChange={setActiveTab}
          segments={VIEW_TABS}
          counts={{ [activeTab]: totalCount }}
          label="Email view"
          className="-ml-2.5"
        />
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-72 lg:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sender or subject…"
              className="h-9 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DateRangeFilter
            presets={HISTORY_PRESETS}
            defaultPreset="7d"
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />
        </div>
      </div>

      {/* Thread table or empty state */}
      {threads.length === 0 ? (
        <EmailInboxEmptyState inboundAddress={settings?.inboundAddress} view={activeTab} />
      ) : (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-background sticky top-0 z-10">
              <TableRow>
                <TableHead>Broker</TableHead>
                <TableHead className="hidden sm:table-cell">Route</TableHead>
                <TableHead className="hidden lg:table-cell">Pickup</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="hidden md:table-cell">Equipment</TableHead>
                <TableHead className="text-right">Received</TableHead>
                {!isPendingView && <TableHead>Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {threads.map((thread) => (
                <EmailThreadRow
                  key={thread.id}
                  thread={thread}
                  showStatus={!isPendingView}
                  onClick={() => handleRowClick(thread)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Import/review sheet */}
      <EmailImportSheet thread={selectedThread} open={importSheetOpen} onOpenChange={handleSheetOpenChange} />
    </div>
  );
}
