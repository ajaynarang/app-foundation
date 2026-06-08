'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useSettlements, useSettlementSummary } from '@/features/financials/pay';
import { settlementsApi } from '@/features/financials/pay/api';
import { showError } from '@sally/ui';
import { SettlementDetailSheet } from '@/features/financials/pay/components/settlement-detail-sheet';
import { BatchCalculateSheet } from '@/features/financials/pay/components/batch-calculate-sheet';
import { BatchActionBar } from '@/features/financials/pay/components/batch-action-bar';
import { DateRangeFilter, PERIOD_PRESETS } from '@/shared/components/ui/date-range-filter';
import { PageHeader, FilterBar } from '@/shared/components/page-chrome';
import type { SettlementListParams } from '@/features/financials/pay/types';
import { Calculator, Users, DollarSign, Clock, TrendingUp, FileText, Eye } from 'lucide-react';
import { PdfPreviewDialog } from '@/features/fleet/documents/components/viewer';
import { SortButton } from '@/shared/components/ui/sort-button';
import type { SortOption } from '@/shared/components/ui/sort-button';
import { formatCents } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { SettlementStatusBadge } from '@/features/financials/pay/components/settlement-status-badge';
import { AccountingSyncBadge } from '@/features/integrations/accounting/components/accounting-sync-badge';
import { useDebounce } from '@/shared/hooks/use-debounce';

export default function PayPage() {
  const { formatCalendarDate } = useFormatters();

  // State
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const defaultPeriod = PERIOD_PRESETS.find((p) => p.value === 'this-week')?.getRange();
  const [periodStart, setPeriodStart] = useState<string | undefined>(defaultPeriod?.from);
  const [periodEnd, setPeriodEnd] = useState<string | undefined>(defaultPeriod?.to);
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchCalcOpen, setBatchCalcOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewSettlementId, setPdfPreviewSettlementId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);

  // Build query params
  const listParams = useMemo((): SettlementListParams => {
    const params: SettlementListParams = {};
    if (periodStart) params.periodStart = periodStart;
    if (periodEnd) params.periodEnd = periodEnd;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (debouncedSearch) params.search = debouncedSearch;
    if (sortBy) {
      params.sortBy = sortBy;
      params.sortOrder = sortOrder;
    }
    return params;
  }, [statusFilter, debouncedSearch, sortBy, sortOrder, periodStart, periodEnd]);

  const SETTLEMENT_SORT_OPTIONS: SortOption[] = [
    { value: 'createdAt', label: 'Most Recent', defaultOrder: 'desc' },
    { value: 'period', label: 'Period', defaultOrder: 'desc' },
    { value: 'netPay', label: 'Net Pay', defaultOrder: 'desc' },
    { value: 'driverName', label: 'Driver', defaultOrder: 'asc' },
    { value: 'status', label: 'Status', defaultOrder: 'asc' },
  ];

  // Queries
  const { data: summary, isLoading: summaryLoading } = useSettlementSummary(
    periodStart && periodEnd ? { periodStart, periodEnd } : undefined,
  );
  const { data: settlements, isLoading: settlementsLoading } = useSettlements(listParams);

  // Live sync for detail sheet
  const liveSettlement = useMemo(() => {
    if (!selectedSettlementId || !settlements) return null;
    return settlements.find((s) => s.settlementId === selectedSettlementId) ?? null;
  }, [selectedSettlementId, settlements]);

  // Prefetch settlement detail on hover
  const queryClient = useQueryClient();
  const handlePrefetch = useCallback(
    (settlementId: string) => {
      queryClient.prefetchQuery({
        queryKey: ['settlements', settlementId],
        queryFn: () => settlementsApi.getById(settlementId),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );

  // Summary card click to filter
  const handleSummaryClick = (status: string) => {
    setStatusFilter(status);
  };

  // Multi-select
  const allSelected = settlements && settlements.length > 0 && selectedIds.length === settlements.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(settlements?.map((s) => s.settlementId) ?? []);
    }
  };

  const toggleSelect = (settlementId: string) => {
    setSelectedIds((prev) =>
      prev.includes(settlementId) ? prev.filter((id) => id !== settlementId) : [...prev, settlementId],
    );
  };

  return (
    <FeatureGuard featureKey="driver_pay">
      <div className="space-y-6 pb-20">
        {/* Header */}
        <PageHeader
          title="Pay"
          subtitle="What your drivers earned, settled fast"
          actions={
            <Button onClick={() => setBatchCalcOpen(true)}>
              <Calculator className="mr-2 h-4 w-4" />
              Run Settlements
            </Button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => handleSummaryClick('DRAFT')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-foreground">
                    {formatCents(summary?.pendingApprovalCents ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">{summary?.pendingApproval ?? 0} settlements</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => handleSummaryClick('APPROVED')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Ready to Pay</CardTitle>
              <DollarSign className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-info">{formatCents(summary?.readyToPayCents ?? 0)}</div>
                  <p className="text-xs text-muted-foreground">{summary?.readyToPay ?? 0} settlements</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => handleSummaryClick('PAID')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Paid This Period</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  {formatCents(summary?.paidThisMonthCents ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Drivers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-foreground">{summary?.activeDrivers ?? 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Avg Settlement</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold text-foreground">
                  {formatCents(summary?.avgSettlementCents ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Zone 3 — Filter bar (no redundant card title; the page header names the page) */}
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search settlements..."
          sort={
            <SortButton
              options={SETTLEMENT_SORT_OPTIONS}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={(by, order) => {
                setSortBy(by);
                setSortOrder(order);
              }}
            />
          }
        >
          <DateRangeFilter
            dateFrom={periodStart}
            dateTo={periodEnd}
            defaultPreset="this-week"
            presets={PERIOD_PRESETS}
            onChange={(from, to) => {
              setPeriodStart(from);
              setPeriodEnd(to);
            }}
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
            </SelectContent>
          </Select>
        </FilterBar>

        {/* Zone 4 — Data */}
        <Card>
          <CardContent>
            {settlementsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !settlements?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                No settlements found. Run settlements to calculate driver pay.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Settlement #</TableHead>
                      <TableHead className="hidden sm:table-cell">Driver</TableHead>
                      <TableHead className="hidden md:table-cell">Period</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Gross</TableHead>
                      <TableHead className="text-right">Net Pay</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">QB</TableHead>
                      <TableHead className="w-10 hidden md:table-cell" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlements.map((s) => (
                      <TableRow
                        key={s.settlementId}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${s.status === 'VOID' ? 'opacity-75' : ''}`}
                        onMouseEnter={() => handlePrefetch(s.settlementId)}
                        onClick={() => setSelectedSettlementId(s.settlementId)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(s.settlementId)}
                            onCheckedChange={() => toggleSelect(s.settlementId)}
                            aria-label={`Select ${s.settlementNumber}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{s.settlementNumber}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{s.driver?.name}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {formatCalendarDate(s.periodStart, DISPLAY_FORMATS.FRIENDLY)} -{' '}
                          {formatCalendarDate(s.periodEnd, DISPLAY_FORMATS.FRIENDLY)}
                        </TableCell>
                        <TableCell className="text-right text-foreground hidden lg:table-cell">
                          {formatCents(s.grossPayCents)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground">
                          {formatCents(s.netPayCents)}
                        </TableCell>
                        <TableCell>
                          <SettlementStatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <AccountingSyncBadge
                            externalId={s.externalBillId}
                            syncedAt={s.externalSyncedAt}
                            syncError={s.externalSyncError}
                          />
                        </TableCell>
                        <TableCell className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Preview PDF"
                              onClick={async () => {
                                try {
                                  const blobUrl = await settlementsApi.getPreviewBlobUrl(s.settlementId);
                                  setPdfPreviewUrl(blobUrl);
                                  setPdfPreviewSettlementId(s.settlementId);
                                  setPdfPreviewOpen(true);
                                } catch {
                                  showError('Failed to load PDF preview');
                                }
                              }}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Download PDF"
                              onClick={() => settlementsApi.downloadPdf(s.settlementId)}
                            >
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Settlement Detail Sheet — live sync from cache */}
      {liveSettlement && (
        <SettlementDetailSheet
          settlement={liveSettlement}
          open={!!liveSettlement}
          onOpenChange={(open) => {
            if (!open) setSelectedSettlementId(null);
          }}
        />
      )}

      {/* Batch Calculate Sheet */}
      <BatchCalculateSheet
        open={batchCalcOpen}
        onOpenChange={setBatchCalcOpen}
        periodStart={periodStart ?? ''}
        periodEnd={periodEnd ?? ''}
      />

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedIds={selectedIds}
        settlements={settlements ?? []}
        onClearSelection={() => setSelectedIds([])}
      />

      {/* Inline PDF Preview */}
      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onOpenChange={(next) => {
          setPdfPreviewOpen(next);
          if (!next && pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
            setPdfPreviewSettlementId(null);
          }
        }}
        pdfUrl={pdfPreviewUrl}
        title={pdfPreviewSettlementId ? `Settlement ${pdfPreviewSettlementId}` : 'Settlement Preview'}
        onDownload={pdfPreviewSettlementId ? () => settlementsApi.downloadPdf(pdfPreviewSettlementId) : undefined}
      />
    </FeatureGuard>
  );
}
