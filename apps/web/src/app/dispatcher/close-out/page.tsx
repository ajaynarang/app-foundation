'use client';

import { useState, useDeferredValue, useMemo } from 'react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { showSuccess } from '@sally/ui';
import { DateRangeFilter } from '@/shared/components/ui/date-range-filter';
import { PageHeader, FilterBar, StatusPivot } from '@/shared/components/page-chrome';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { useCloseOutSummary, useCloseOutLoads } from '@/features/financials/close-out';
import { useGenerateInvoice } from '@/features/financials/billing';
import { CloseOutSummaryCards } from '@/features/financials/close-out/components/close-out-summary-cards';
import { CloseOutTable } from '@/features/financials/close-out/components/close-out-table';
import { CloseOutReviewSheet } from '@/features/financials/close-out/components/close-out-review-sheet';
import type { CloseOutLoad, CloseOutListParams } from '@/features/financials/close-out/types';
import { LoadBillingStatus } from '@sally/shared-types';

export default function CloseOutPage() {
  return (
    <FeatureGuard featureKey="close_out">
      <CloseOutContent />
    </FeatureGuard>
  );
}

function CloseOutContent() {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [reviewLoad, setReviewLoad] = useState<CloseOutLoad | null>(null);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();

  // Fetch ALL statuses in the current date+search scope so we can derive tab
  // counts that match the list (view-scope counts). The summary cards above
  // stay ambient (fleet-wide, see useCloseOutSummary).
  const params: CloseOutListParams = {
    billingStatus: undefined,
    search: deferredSearch.trim() || undefined,
    dateFrom,
    dateTo,
    limit: 200,
  };

  const { data: summary, isLoading: summaryLoading } = useCloseOutSummary();
  const { data: listData, isLoading: listLoading } = useCloseOutLoads(params);
  const generateInvoice = useGenerateInvoice();

  const allLoads = listData?.loads ?? [];
  const tabCounts = useMemo(
    () => ({
      all: allLoads.length,
      [LoadBillingStatus.PENDING_DOCUMENTS]: allLoads.filter(
        (l) => l.billingStatus === LoadBillingStatus.PENDING_DOCUMENTS,
      ).length,
      [LoadBillingStatus.READY_FOR_REVIEW]: allLoads.filter(
        (l) => l.billingStatus === LoadBillingStatus.READY_FOR_REVIEW,
      ).length,
      [LoadBillingStatus.APPROVED]: allLoads.filter((l) => l.billingStatus === LoadBillingStatus.APPROVED).length,
    }),
    [allLoads],
  );

  const visibleLoads = useMemo(
    () => (activeTab === 'all' ? allLoads : allLoads.filter((l) => l.billingStatus === activeTab)),
    [allLoads, activeTab],
  );

  const handleReview = (load: CloseOutLoad) => {
    setReviewLoad(load);
  };

  const handleInvoice = (load: CloseOutLoad) => {
    generateInvoice.mutate(
      { loadId: load.loadNumber },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSuccess: (invoice: any) => {
          showSuccess(`Invoice ${invoice.invoiceNumber ?? 'created'} — Load moved to Billing`);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Zone 1 — Header */}
      <PageHeader title="Close Out" subtitle="From delivered to billed, nothing slips" />

      {/* KPI row */}
      <CloseOutSummaryCards summary={summary} loading={summaryLoading} />

      {/* Zone 3 — Filter bar: status pivot · search · date (status is a filter, not nav) */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search loads..."
        searchClassName="w-full sm:w-64"
      >
        <StatusPivot
          value={activeTab}
          onChange={setActiveTab}
          segments={[
            { value: 'all', label: 'All' },
            { value: LoadBillingStatus.PENDING_DOCUMENTS, label: 'Needs Docs' },
            { value: LoadBillingStatus.READY_FOR_REVIEW, label: 'Ready' },
            { value: LoadBillingStatus.APPROVED, label: 'Approved' },
          ]}
          counts={{
            all: tabCounts.all,
            [LoadBillingStatus.PENDING_DOCUMENTS]: tabCounts[LoadBillingStatus.PENDING_DOCUMENTS],
            [LoadBillingStatus.READY_FOR_REVIEW]: tabCounts[LoadBillingStatus.READY_FOR_REVIEW],
            [LoadBillingStatus.APPROVED]: tabCounts[LoadBillingStatus.APPROVED],
          }}
          label="Close-out status"
        />
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="30d"
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </FilterBar>

      {/* Zone 4 — Data */}
      <Card>
        <CardContent>
          <CloseOutTable loads={visibleLoads} loading={listLoading} onReview={handleReview} onInvoice={handleInvoice} />
        </CardContent>
      </Card>

      <CloseOutReviewSheet
        load={reviewLoad}
        open={!!reviewLoad}
        onOpenChange={(open) => {
          if (!open) setReviewLoad(null);
        }}
      />
    </div>
  );
}
