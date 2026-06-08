'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  TypeBreakdownTable,
  RecentFailures,
  JobDetailSheet,
  useCategorySummary,
  useJobsList,
  useRetryJob,
  useCancelJob,
  useJob,
} from '@/features/system-activity';
import type { Job } from '@/features/system-activity';

export default function SystemActivityPage() {
  const searchParams = useSearchParams();

  // Pre-select category from URL query param (e.g. ?category=tms)
  const initialCategory = searchParams.get('category') ?? 'all';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Auto-open job detail from ?jobId= query param (numeric Int PK; 0 = none → hook stays disabled)
  const jobIdParam = searchParams.get('jobId');
  const linkedJobId = jobIdParam ? Number(jobIdParam) : 0;
  const { data: linkedJob } = useJob(Number.isNaN(linkedJobId) ? 0 : linkedJobId);
  useEffect(() => {
    if (linkedJob && jobIdParam) {
      setSelectedJob(linkedJob);
    }
  }, [linkedJob, jobIdParam]);

  const { data: categories, isLoading } = useCategorySummary();
  const { data: failedJobs } = useJobsList({ status: 'failed', limit: 5 });
  const retryMutation = useRetryJob();
  const cancelMutation = useCancelJob();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">System Activity</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">Monitor background jobs and data sync status</p>
      </div>

      <TypeBreakdownTable
        categories={categories}
        isLoading={isLoading}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        onTypeClick={(_categorySlug, _type) => {
          // In console, clicking a type row filters the jobs list by that type
          // For now, this is a no-op since we don't have a detail sub-page
        }}
      />

      <RecentFailures
        failures={failedJobs?.items}
        isLoading={false}
        onRetry={(jobId) => retryMutation.mutate(jobId)}
        isRetrying={retryMutation.isPending}
        retryingJobId={retryMutation.variables}
        onJobClick={setSelectedJob}
      />

      <JobDetailSheet
        job={selectedJob}
        open={!!selectedJob}
        onOpenChange={(open) => {
          if (!open) setSelectedJob(null);
        }}
        onRetry={(jobId) => retryMutation.mutate(jobId)}
        onCancel={(jobId) => cancelMutation.mutate(jobId)}
        isRetrying={retryMutation.isPending}
        isCancelling={cancelMutation.isPending}
      />
    </div>
  );
}
