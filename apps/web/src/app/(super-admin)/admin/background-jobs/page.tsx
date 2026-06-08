'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api';
import {
  MetricsBar,
  TypeBreakdownTable,
  RecentFailures,
  JobDetailSheet,
  useAdminMetrics,
  useAdminCategorySummary,
  useAdminJobsList,
  useAdminRetryJob,
} from '@/features/system-activity';
import { JobStatus } from '@sally/shared-types';
import { ScheduleManager } from '@/features/system-activity/components/schedule-manager';
import type { Job } from '@/features/system-activity';

const BULL_BOARD_URL = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/admin/queues`;

interface Tenant {
  id: number;
  companyName: string;
  status: string;
}

export default function AdminSystemActivityPage() {
  const router = useRouter();
  const [selectedTenantId, setSelectedTenantId] = useState<number | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Fetch tenants for dropdown — only active ones have running jobs
  const { data: allTenants } = useQuery<Tenant[]>({
    queryKey: ['admin', 'tenants-list'],
    queryFn: () => apiClient('/tenants'),
  });
  const tenants = allTenants?.filter((t) => t.status === 'ACTIVE');

  // Auto-select first active tenant if none selected (category summary requires tenantId)
  useEffect(() => {
    if (!selectedTenantId && tenants?.length) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  const { data: metrics, isLoading: metricsLoading } = useAdminMetrics(selectedTenantId);
  const { data: categories, isLoading: categoriesLoading } = useAdminCategorySummary(selectedTenantId!);
  const { data: failedJobs } = useAdminJobsList({
    tenantId: selectedTenantId,
    status: JobStatus.FAILED,
    limit: 5,
  });
  const retryMutation = useAdminRetryJob();

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Background Jobs</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Monitor and manage background jobs and schedules across all tenants
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(BULL_BOARD_URL, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Bull Board
        </Button>
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-8 mt-6">
          <div className="flex justify-end">
            <Select
              value={selectedTenantId?.toString() ?? ''}
              onValueChange={(v) => setSelectedTenantId(v ? parseInt(v) : undefined)}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Select Tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants?.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <MetricsBar metrics={metrics} isLoading={metricsLoading} />

          <TypeBreakdownTable
            categories={categories}
            isLoading={categoriesLoading}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onTypeClick={(categorySlug, type) =>
              router.push(
                `/admin/background-jobs/${categorySlug}/${type}${selectedTenantId ? `?tenantId=${selectedTenantId}` : ''}`,
              )
            }
          />

          <RecentFailures
            failures={failedJobs?.items}
            isLoading={false}
            onRetry={(jobId) => retryMutation.mutate(jobId)}
            isRetrying={retryMutation.isPending}
            retryingJobId={retryMutation.variables as number | undefined}
            onJobClick={setSelectedJob}
          />
        </TabsContent>

        <TabsContent value="schedules" className="mt-6">
          <ScheduleManager />
        </TabsContent>
      </Tabs>

      <JobDetailSheet
        job={selectedJob}
        open={!!selectedJob}
        onOpenChange={(open) => {
          if (!open) setSelectedJob(null);
        }}
        onRetry={(jobId) => retryMutation.mutate(jobId)}
        onCancel={() => {}}
        isRetrying={retryMutation.isPending}
        isCancelling={false}
        showTenant
      />
    </div>
  );
}
