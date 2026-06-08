'use client';

import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { KpiStrip } from '@/features/analytics/components/KpiStrip';
import { PageHeader } from '@/shared/components/page-chrome';
import { ReportGrid } from '@/features/analytics/components/ReportGrid';
import { useSallyStore } from '@/features/platform/sally-ai/store';

function CustomReportCta() {
  const expandStrip = useSallyStore((s) => s.expandStrip);
  const setDraftInput = useSallyStore((s) => s.setDraftInput);

  const handleAskSally = () => {
    setDraftInput(
      'I need a custom report. Can you pull together data from my loads, invoices, drivers, or customers? I can tell you what filters and format I need.',
    );
    expandStrip('tab');
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-foreground">Need a custom report?</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ask Sally to build any report from your data — filter by date, customer, lane, driver, or any criteria.
              Export as CSV or PDF.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleAskSally} className="shrink-0">
          <Sparkles className="mr-2 h-4 w-4" />
          Ask Sally
        </Button>
      </CardContent>
    </Card>
  );
}

function ReportsHub() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader title="Insights" subtitle="Performance and profitability, decoded" />

      {/* KPI Strip */}
      <KpiStrip />

      {/* Report Cards Grid */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">All Reports</h2>
        <ReportGrid />
      </div>

      {/* Custom Report CTA */}
      <CustomReportCta />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <FeatureGuard featureKey="insights">
      <ReportsHub />
    </FeatureGuard>
  );
}
