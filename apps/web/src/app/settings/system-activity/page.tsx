'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { JobStatus } from '@app/shared-types';

export default function SystemActivityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-select category from URL query param (e.g. ?category=tms)
  const initialCategory = searchParams.get('category') ?? 'all';
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Auto-open job detail from ?jobId= query param
  const jobIdParam = searchParams.get('jobId');
  const linkedJobId = jobIdParam ? Number(jobIdParam) : 0;
  const { data: linkedJob } = useJob(linkedJobId);
  useEffect(() => {
    if (linkedJob && jobIdParam) {
      setSelectedJob(linkedJob);
    }
  }, [linkedJob, jobIdParam]);

  const { data: categories, isLoading } = useCategorySummary();
  const { data: failedJobs } = useJobsList({ status: JobStatus.FAILED, limit: 5 });
  const retryMutation = useRetryJob();
  const cancelMutation = useCancelJob();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">System Activity</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">Background jobs and sync status at a glance</p>
      </div>

      <TypeBreakdownTable
        categories={categories}
        isLoading={isLoading}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        onTypeClick={(categorySlug, type) => router.push(`/settings/system-activity/${categorySlug}/${type}`)}
      />

      <RecentFailures
        failures={failedJobs?.items}
        isLoading={false}
        onRetry={(jobId) => retryMutation.mutate(jobId)}
        isRetrying={retryMutation.isPending}
        retryingJobId={retryMutation.variables as number | undefined}
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
