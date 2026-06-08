'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { JobStatusBadge } from './job-status-badge';
import type { Job, PaginatedJobs } from '../types';
import { formatDurationBetween, formatJobLabel } from '../utils';

interface JobRunsTableProps {
  data: PaginatedJobs | undefined;
  isLoading: boolean;
  onJobClick: (job: Job) => void;
  onPageChange: (offset: number) => void;
}

export function JobRunsTable({ data, isLoading, onJobClick, onPageChange }: JobRunsTableProps) {
  const pageSize = data?.limit ?? 20;
  const currentPage = data ? Math.floor(data.offset / pageSize) : 0;
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No jobs found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Started</TableHead>
              <TableHead className="hidden sm:table-cell">Duration</TableHead>
              <TableHead className="hidden md:table-cell max-w-[200px]">Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => (
              <TableRow
                key={job.id}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900"
                onClick={() => onJobClick(job)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">{formatJobLabel(job.id)}</TableCell>
                <TableCell>
                  <JobStatusBadge status={job.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {job.startedAt
                    ? formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })
                    : job.queuedAt
                      ? formatDistanceToNow(new Date(job.queuedAt), { addSuffix: true })
                      : '-'}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {formatDurationBetween(job.startedAt, job.completedAt)}
                </TableCell>
                <TableCell className="hidden md:table-cell max-w-[200px]">
                  {job.errorMessage && <p className="text-xs text-critical truncate">{job.errorMessage}</p>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(0, (currentPage - 1) * pageSize))}
              disabled={currentPage === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange((currentPage + 1) * pageSize)}
              disabled={currentPage >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
