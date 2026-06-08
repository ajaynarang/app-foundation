'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Activity } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { ScrollArea } from '@sally/ui/components/ui/scroll-area';
import { jobsApi } from '../api';
import { JobStatus } from '@sally/shared-types';

function formatTimeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatDuration(startStr?: string | null, endStr?: string | null) {
  if (!startStr) return null;
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case JobStatus.QUEUED:
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />;
    case JobStatus.PROCESSING:
      return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-foreground" />;
    case JobStatus.COMPLETED:
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case JobStatus.FAILED:
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-critical" />;
    default:
      return null;
  }
}

/** Extract a short broker/customer name from the filename (before the first dash) */
function extractShortName(fileName?: string): string | null {
  if (!fileName) return null;
  // Filenames like "005617664 - JY CARRIERS LLC - JYCAHAMA00 - Carrier Rate..."
  const parts = fileName.split(' - ');
  if (parts.length >= 2) return parts[1].trim();
  return null;
}

interface JobItem {
  id: number;
  category: string;
  type: string;
  status: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputData?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultData?: Record<string, any> | null;
  errorMessage?: string | null;
  queuedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface JobsActivityPanelProps {
  onLoadClick?: (loadId: string) => void;
  /** When set, the panel opens automatically and shows these job IDs as active */
  pendingJobIds?: number[];
  /** Called when the panel is opened/closed */
  onOpenChange?: (open: boolean) => void;
  /**
   * Controlled open state (e.g. opened from the ⋯ More menu). When provided, the panel
   * is fully controlled and its own trigger button is hidden — render it as a dialog.
   */
  open?: boolean;
  /** Render the panel as a dialog (no trigger button) instead of an anchored popover. */
  asDialog?: boolean;
  /**
   * Reports whether there are active (queued/processing) jobs, so the toolbar can decide
   * to surface a live indicator only when something is happening (adaptive). Called on change.
   */
  onActiveCountChange?: (count: number) => void;
}

export function JobsActivityPanel({
  onLoadClick,
  pendingJobIds,
  onOpenChange,
  open: controlledOpen,
  asDialog,
  onActiveCountChange,
}: JobsActivityPanelProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const queryClient = useQueryClient();

  // Auto-open when pendingJobIds are set (uncontrolled mode only)
  useEffect(() => {
    if (!isControlled && pendingJobIds && pendingJobIds.length > 0) {
      setUncontrolledOpen(true);
      // Immediately refetch to pick up the new jobs
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  }, [isControlled, pendingJobIds, queryClient]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!isControlled) setUncontrolledOpen(open);
      onOpenChange?.(open);
    },
    [isControlled, onOpenChange],
  );

  // Fetch both documents and lanes categories
  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ['jobs', 'documents'],
    queryFn: () => jobsApi.list({ category: 'documents', limit: 20 }),
    refetchInterval: isOpen ? 5_000 : false,
  });
  const { data: lanesData, refetch: refetchLanes } = useQuery({
    queryKey: ['jobs', 'lanes'],
    queryFn: () => jobsApi.list({ category: 'lanes', limit: 20 }),
    refetchInterval: isOpen ? 5_000 : false,
  });

  const refetch = () => {
    refetchDocs();
    refetchLanes();
  };

  // Merge and sort by most recent first
  const jobs: JobItem[] = [...(docsData?.items ?? []), ...(lanesData?.items ?? [])].sort((a, b) => {
    const aTime = new Date(a.completedAt || a.startedAt || a.queuedAt).getTime();
    const bTime = new Date(b.completedAt || b.startedAt || b.queuedAt).getTime();
    return bTime - aTime;
  });

  // Optimistic entries: if pendingJobIds exist but aren't in jobs yet, show them as queued
  const jobIdsInList = new Set(jobs.map((j) => j.id));
  const optimisticJobs: JobItem[] = (pendingJobIds ?? [])
    .filter((id) => !jobIdsInList.has(id))
    .map((id) => ({
      id,
      category: 'documents',
      type: 'ratecon',
      status: JobStatus.QUEUED,
      queuedAt: new Date().toISOString(),
    }));

  const allJobs = [...optimisticJobs, ...jobs];
  const activeJobs = allJobs.filter((j) => j.status === JobStatus.QUEUED || j.status === JobStatus.PROCESSING);
  const recentJobs = allJobs.filter((j) => j.status !== JobStatus.QUEUED && j.status !== JobStatus.PROCESSING);

  // Report active count so the toolbar can surface a live indicator only when relevant.
  useEffect(() => {
    onActiveCountChange?.(activeJobs.length);
  }, [activeJobs.length, onActiveCountChange]);

  const handleRetry = async (jobId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await jobsApi.retry(jobId);
    refetch();
  };

  const panelBody = (
    <ScrollArea className="max-h-[340px]">
      {activeJobs.length > 0 && (
        <div className="px-3 py-2 space-y-1">
          {activeJobs.map((job) => (
            <ActiveJobRow key={job.id} job={job} />
          ))}
        </div>
      )}

      {recentJobs.length > 0 && (
        <div className="px-3 py-2 space-y-1">
          {activeJobs.length > 0 && (
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2 pb-1">Recent</p>
          )}
          {recentJobs.slice(0, 8).map((job) => (
            <RecentJobRow
              key={job.id}
              job={job}
              onLoadClick={onLoadClick}
              onRetry={handleRetry}
              onClose={() => handleOpenChange(false)}
            />
          ))}
        </div>
      )}

      {allJobs.length === 0 && (
        <div className="px-3 py-8 text-center">
          <Activity className="h-5 w-5 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </div>
      )}
    </ScrollArea>
  );

  // Dialog mode — opened from the ⋯ More menu (controlled, no trigger button).
  if (asDialog) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md p-0">
          {/* pr-12 reserves space for the dialog's built-in X (absolute right-4) so
              "View all" never sits under it. */}
          <DialogHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border py-2 pl-3 pr-12">
            <DialogTitle className="text-sm">Processing Activity</DialogTitle>
            <Link
              href="/settings/system-activity"
              className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all
            </Link>
          </DialogHeader>
          {panelBody}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative h-8 w-8">
          <Activity className="h-4 w-4" />
          {activeJobs.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-foreground text-background text-2xs font-medium flex items-center justify-center">
              {activeJobs.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-medium text-foreground">Processing Activity</p>
          <Link
            href="/settings/system-activity"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </div>
        <ScrollArea className="max-h-[340px]">
          {activeJobs.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              {activeJobs.map((job) => (
                <ActiveJobRow key={job.id} job={job} />
              ))}
            </div>
          )}

          {recentJobs.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              {activeJobs.length > 0 && (
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-2 pb-1">
                  Recent
                </p>
              )}
              {recentJobs.slice(0, 8).map((job) => (
                <RecentJobRow
                  key={job.id}
                  job={job}
                  onLoadClick={onLoadClick}
                  onRetry={handleRetry}
                  onClose={() => handleOpenChange(false)}
                />
              ))}
            </div>
          )}

          {allJobs.length === 0 && (
            <div className="px-3 py-8 text-center">
              <Activity className="h-5 w-5 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No recent activity</p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ActiveJobRow({ job }: { job: JobItem }) {
  const isLane = job.category === 'lanes';

  let label: string;
  if (isLane) {
    const laneName = job.inputData?.laneName || job.inputData?.laneId;
    label = `Generating load${laneName ? ` · ${laneName}` : ''}`;
  } else {
    const shortName = extractShortName(job.inputData?.fileName);
    label = `Parsing ratecon${shortName ? ` · ${shortName}` : ''}`;
  }

  return (
    <div className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-accent/50 transition-colors">
      <StatusIcon status={job.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{label}...</p>
        <p className="text-xs text-muted-foreground mt-0.5">{formatDuration(job.startedAt || job.queuedAt)} elapsed</p>
      </div>
    </div>
  );
}

function RecentJobRow({
  job,
  onLoadClick,
  onRetry,
  onClose,
}: {
  job: JobItem;
  onLoadClick?: (loadId: string) => void;
  onRetry: (jobId: number, e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = job.resultData as Record<string, any> | null;
  const isCompleted = job.status === 'COMPLETED';
  const isFailed = job.status === 'FAILED';
  const isLane = job.category === 'lanes';

  const handleClick = () => {
    if (isCompleted && result?.loadNumber && onLoadClick) {
      onClose();
      onLoadClick(result.loadNumber);
    }
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors ${
        isCompleted && result?.loadNumber ? 'cursor-pointer hover:bg-accent/50' : 'hover:bg-accent/30'
      }`}
      onClick={handleClick}
    >
      <StatusIcon status={job.status} />
      <div className="flex-1 min-w-0">
        {isCompleted ? (
          isLane ? (
            <CompletedLaneContent result={result} inputData={job.inputData} />
          ) : (
            <CompletedRateconContent result={result} inputData={job.inputData} />
          )
        ) : isFailed ? (
          isLane ? (
            <FailedLaneContent job={job} onRetry={onRetry} />
          ) : (
            <FailedRateconContent job={job} onRetry={onRetry} />
          )
        ) : (
          <p className="text-sm text-foreground truncate">
            {job.inputData?.fileName || job.inputData?.laneName || job.type}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {formatTimeAgo(job.completedAt || job.startedAt || job.queuedAt)}
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CompletedLaneContent({
  result,
  inputData,
}: {
  result: Record<string, any> | null;
  inputData?: Record<string, any>;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground leading-tight">{result?.loadNumber || 'Load generated'}</p>
        <span className="text-xs text-muted-foreground">{result?.laneId || inputData?.laneId}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">
        {result?.customerName || inputData?.customerName || 'Lane auto-generation'}
      </p>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CompletedRateconContent({
  result,
  inputData,
}: {
  result: Record<string, any> | null;
  inputData?: Record<string, any>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsedData = result?.parsedData as Record<string, any> | undefined;
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground leading-tight">{result?.loadNumber || 'Load created'}</p>
        {parsedData?.rate_total_usd && (
          <span className="text-xs text-muted-foreground">${Number(parsedData.rate_total_usd).toLocaleString()}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">
        {parsedData?.broker_name || extractShortName(inputData?.fileName) || 'Rate confirmation'}
        {parsedData?.stops?.length ? ` · ${parsedData.stops.length} stops` : ''}
      </p>
    </>
  );
}

function FailedLaneContent({ job, onRetry }: { job: JobItem; onRetry: (jobId: number, e: React.MouseEvent) => void }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground leading-tight truncate">
          {job.inputData?.laneId || job.inputData?.laneName || 'Lane generation'}
        </p>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 shrink-0" onClick={(e) => onRetry(job.id, e)}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <p className="text-xs text-critical mt-0.5 line-clamp-1">{job.errorMessage || 'Generation failed'}</p>
    </>
  );
}

function FailedRateconContent({
  job,
  onRetry,
}: {
  job: JobItem;
  onRetry: (jobId: number, e: React.MouseEvent) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-foreground leading-tight truncate">
          {extractShortName(job.inputData?.fileName) || 'Ratecon parse'}
        </p>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 shrink-0" onClick={(e) => onRetry(job.id, e)}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <p className="text-xs text-critical mt-0.5 line-clamp-1">{job.errorMessage || 'Processing failed'}</p>
    </>
  );
}
