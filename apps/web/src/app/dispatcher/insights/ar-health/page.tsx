'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Info } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';
import { useInvoiceSummary } from '@/features/financials/billing/hooks/use-invoices';
import { useFactoringSummary } from '@/features/financials/billing/hooks/use-factoring-transactions';
import { ExportMenu } from '@/features/analytics/components/ExportMenu';
import { AskSallyButton } from '@/features/analytics/components/AskSallyButton';
import {
  ArAgingTable,
  AGING_MIN_DAYS_OVERDUE,
  type AgingBucketKey,
} from '@/features/analytics/components/ar-health/ar-aging-table';
import { FactoringDashboard } from '@/features/analytics/components/ar-health/factoring-dashboard';
import { ArAgingByCustomer } from '@/features/analytics/components/ar-health/ar-aging-by-customer';

/**
 * Backend analytics report identifier — used by `<ExportMenu>` to hit
 * `/analytics/reports/${type}/export`. The frontend route slug is
 * `ar-health` (the report's user-facing name) but the backend's
 * underlying analytics report is still keyed `ar-aging` in
 * `apps/backend/src/domains/analytics/analytics.controller.ts`. These
 * two identifiers live in different IA layers and don't need to match.
 */
const BACKEND_REPORT_TYPE = 'ar-aging';

/** AskSally prompt key — registered as 'ar-health' in AskSallyButton.REPORT_PROMPTS. */
const ASK_SALLY_KEY = 'ar-health';

/**
 * AR Health — Phase A of the workspace ↔ insights split. Combines AR
 * aging buckets, Days Sales Outstanding, and factoring activity into a
 * single "how's the receivables side of the business" report. See
 * `.docs/plans/18-reporting/2026-05-20-phase-a-ar-health.md`.
 *
 * Renders the dedicated `<ArAgingTable />` and `<FactoringDashboard />`
 * sub-components (moved into `features/analytics/components/ar-health/`
 * as part of the split — they used to live under
 * `features/financials/billing/components/` and render inline on
 * `/dispatcher/billing`). The data hooks (`useInvoiceSummary`,
 * `useFactoringSummary`) are still owned by the billing feature so
 * this report and the billing KPI strip share a single source of truth.
 */
function ArHealthContent() {
  const router = useRouter();

  // Period selector drives the factoring window (and the DSO note below).
  // Aging buckets are always "now" — they aren't a period concept.
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();

  const { data: summary, isLoading: summaryLoading } = useInvoiceSummary();
  const { data: factoring, isLoading: factoringLoading } = useFactoringSummary({ from: dateFrom, to: dateTo });

  const handleBucketClick = (bucket: AgingBucketKey) => {
    if (bucket === 'current') return;
    const minDays = AGING_MIN_DAYS_OVERDUE[bucket];
    router.push(`/dispatcher/billing?overdue=true&minDaysOverdue=${minDays}`);
  };

  const handleCustomerClick = (customerId: number) => {
    router.push(`/dispatcher/billing?customerId=${customerId}`);
  };

  const dsoLabel = useMemo(() => {
    if (summary?.dsoDays == null) return null;
    return `${summary.dsoDays}d`;
  }, [summary?.dsoDays]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to insights"
            onClick={() => router.push('/dispatcher/insights')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">AR Health</h1>
            <p className="text-sm text-muted-foreground">Aging, factoring activity, and days sales outstanding</p>
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
          <ExportMenu reportType={BACKEND_REPORT_TYPE} params={{ dateFrom, dateTo }} />
          <AskSallyButton reportKey={ASK_SALLY_KEY} dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      </div>

      {/* DSO + headline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                Days sales outstanding
              </CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="What is DSO?"
                    className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  Average days between sending an invoice and getting paid (last 90 days). Lower is better — US SMB
                  trucking benchmark is around 35–42 days. Trending up means cash is taking longer to come in.
                </TooltipContent>
              </Tooltip>
            </div>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {summaryLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : dsoLabel ? (
              <div>
                <div className="text-2xl font-bold text-foreground">{dsoLabel}</div>
                <p className="text-xs text-muted-foreground mt-0.5">Rolling 90-day average</p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-bold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground mt-0.5">Not enough paid invoices yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aging table — tenant totals, clickable rows drill into /billing */}
      {summaryLoading ? <Skeleton className="h-64 w-full" /> : <ArAgingTable onBucketClick={handleBucketClick} />}

      {/* Customer breakdown — same 5 buckets, split by who owes what */}
      <ArAgingByCustomer onCustomerClick={handleCustomerClick} />

      {/* Factoring tiles */}
      {factoringLoading ? <Skeleton className="h-32 w-full" /> : factoring ? <FactoringDashboard /> : null}
    </div>
  );
}

export default function ArHealthPage() {
  return (
    <FeatureGuard featureKey="insights">
      <ArHealthContent />
    </FeatureGuard>
  );
}
