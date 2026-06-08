'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useReportData } from '@/features/analytics/hooks/use-analytics';
import { getReportConfig, VALID_REPORT_TYPES } from '@/features/analytics/data/report-configs';
import { ReportChart } from '@/features/analytics/components/ReportChart';
import { ReportTable } from '@/features/analytics/components/ReportTable';
import { ExportMenu } from '@/features/analytics/components/ExportMenu';
import { AskSallyButton } from '@/features/analytics/components/AskSallyButton';
import type { ReportType, ReportParams } from '@/features/analytics/types';

function SummaryCards({ summary, isLoading }: { summary?: Record<string, number>; isLoading: boolean }) {
  const { formatCents } = useFormatters();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary || Object.keys(summary).length === 0) return null;

  const entries = Object.entries(summary).slice(0, 4);

  function formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/Cents$/, '')
      .replace(/Percent$/, ' %')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }

  function formatVal(key: string, val: number): string {
    if (key.endsWith('Cents')) return formatCents(val);
    if (key.endsWith('Percent')) return `${val.toFixed(1)}%`;
    return val.toLocaleString();
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {entries.map(([key, val]) => (
        <Card key={key}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">{formatLabel(key)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl font-bold text-foreground">{formatVal(key, val)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReportPageContent() {
  const params = useParams();
  const router = useRouter();
  const reportType = params.reportType as string;

  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  // All hooks must be called before any conditional returns
  const config = useMemo(() => getReportConfig(reportType), [reportType]);
  const isValidType = VALID_REPORT_TYPES.includes(reportType as ReportType);

  const reportParams: ReportParams = useMemo(() => ({ dateFrom, dateTo, groupBy }), [dateFrom, dateTo, groupBy]);

  const { data, isLoading } = useReportData(reportType as ReportType, reportParams, { enabled: isValidType });

  // Redirect invalid report types via useEffect (not during render)
  useEffect(() => {
    if (!isValidType) {
      router.replace('/dispatcher/insights');
    }
  }, [isValidType, router]);

  if (!config || !isValidType) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to reports"
            onClick={() => router.push('/dispatcher/insights')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{config.title}</h1>
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            defaultPreset="30d"
            presets={HISTORY_PRESETS}
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />
          <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs px-2 h-6">
                Day
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-2 h-6">
                Week
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-2 h-6">
                Month
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <ExportMenu reportType={reportType} params={reportParams} />
          <AskSallyButton reportKey={reportType} dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={data?.summary} isLoading={isLoading} />

      {/* Chart */}
      <ReportChart data={data?.timeSeries} isLoading={isLoading} />

      {/* Data Table */}
      <ReportTable columns={data?.columns} data={data?.table} isLoading={isLoading} />
    </div>
  );
}

export default function ReportTypePage() {
  return (
    <FeatureGuard featureKey="insights">
      <ReportPageContent />
    </FeatureGuard>
  );
}
