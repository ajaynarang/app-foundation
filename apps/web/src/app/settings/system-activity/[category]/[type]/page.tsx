'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { ChevronLeft } from 'lucide-react';
import { DateRangeFilter } from '@/shared/components/ui/date-range-filter';
import {
  JobRunsTable,
  JobDetailSheet,
  useJobsList,
  useRetryJob,
  useCancelJob,
  SLUG_TO_CATEGORY,
  CATEGORY_DISPLAY_NAMES,
  TYPE_DISPLAY_NAMES,
} from '@/features/system-activity';
import type { Job } from '@/features/system-activity';

export default function JobRunsPage() {
  const params = useParams<{ category: string; type: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const categorySlug = params.category;
  const type = params.type;
  const category = SLUG_TO_CATEGORY[categorySlug] ?? categorySlug;
  const categoryName = CATEGORY_DISPLAY_NAMES[category] ?? category;
  const typeName = TYPE_DISPLAY_NAMES[type] ?? type;

  const initialStatus = searchParams.get('status') ?? 'all';
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [offset, setOffset] = useState(0);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading } = useJobsList({
    category,
    type,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    dateFrom,
    dateTo,
    limit: 20,
    offset,
  });

  const retryMutation = useRetryJob();
  const cancelMutation = useCancelJob();

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/settings/system-activity')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-xs text-muted-foreground">System Activity &middot; {categoryName}</p>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{typeName}</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="7d"
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
            setOffset(0);
          }}
        />
        <Select
          value={statusFilter}
          onValueChange={(s) => {
            setStatusFilter(s);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <JobRunsTable data={data} isLoading={isLoading} onJobClick={handleJobClick} onPageChange={setOffset} />

      <JobDetailSheet
        job={selectedJob}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRetry={(jobId) => retryMutation.mutate(jobId)}
        onCancel={(jobId) => cancelMutation.mutate(jobId)}
        isRetrying={retryMutation.isPending}
        isCancelling={cancelMutation.isPending}
      />
    </div>
  );
}
