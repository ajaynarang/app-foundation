'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { formatLoadLabel } from '@sally/shared-types';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Badge } from '@sally/ui/components/ui/badge';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useInvoices, useInvoiceSummary } from '@/features/financials/billing';
import { InvoiceDetailSheet } from '@/features/financials/billing/components/invoice-detail-sheet';
import { RecourseAlert } from '@/features/financials/billing/components/recourse-alert';
import { BackfillBanner } from '@/features/financials/billing/components/backfill-banner';
import { BatchActionBar } from '@/features/financials/billing/components/batch-action-bar';
import { OverdueLabel } from '@/features/financials/billing/components/overdue-label';
import { InvoiceStatusBadge } from '@/features/financials/billing/components/invoice-status-badge';
import { BillingPathBadge } from '@/features/financials/billing/components/billing-path-badge';
import { AccountingSyncBadge } from '@/features/integrations/accounting/components/accounting-sync-badge';
import type { Invoice } from '@/features/financials/billing/types';
import { DollarSign, AlertTriangle, CalendarClock, Download, Eye, Building2 } from 'lucide-react';
import { formatCents } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { invoicesApi } from '@/features/financials/billing/api';
import { showError } from '@sally/ui';
import { PdfPreviewDialog } from '@/features/fleet/documents/components/viewer';
import { DateRangeFilter } from '@/shared/components/ui/date-range-filter';
import { SortButton } from '@/shared/components/ui/sort-button';
import { PageHeader, FilterBar } from '@/shared/components/page-chrome';
import type { SortOption } from '@/shared/components/ui/sort-button';

// Debounce hook
function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const INVOICE_SORT_OPTIONS: SortOption[] = [
  { value: 'dueDate', label: 'Due Date', defaultOrder: 'asc' },
  { value: 'amount', label: 'Amount', defaultOrder: 'desc' },
  { value: 'issueDate', label: 'Invoice Date', defaultOrder: 'desc' },
];

export default function BillingPage() {
  const { formatCalendarDate, isCalendarDateOverdue } = useFormatters();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [billingPathFilter, setBillingPathFilter] = useState<string>('all');
  const [overdueOnly, setOverdueOnlyState] = useState(false);
  const [minDaysOverdue, setMinDaysOverdue] = useState<number | undefined>(undefined);
  const [customerId, setCustomerId] = useState<number | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<string>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();

  /**
   * Whenever the user manually changes "overdue-ness" (KPI card click,
   * filter toggle, status pill, etc.) we also drop any minDaysOverdue
   * narrowing that came from an AR-health drill-through. The two pieces
   * of state describe the same intent ("show me overdue") at different
   * granularity; treating them independently would silently keep stale
   * drill-through filters applied.
   */
  const setOverdueOnly = useCallback((next: boolean) => {
    setOverdueOnlyState(next);
    setMinDaysOverdue(undefined);
  }, []);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  // Deep-link: ?open=<invoiceId> → auto-open detail sheet
  const searchParams = useSearchParams();
  const openParam = searchParams.get('open');
  useEffect(() => {
    if (!openParam) return;
    setSelectedInvoiceId(openParam);
    const url = new URL(window.location.href);
    url.searchParams.delete('open');
    window.history.replaceState({}, '', url.toString());
  }, [openParam]);

  // Deep-link from AR Health drill-through:
  //   ?overdue=true&minDaysOverdue=31  → filter to a specific aging bucket.
  //   ?customerId=42                   → filter to a specific customer.
  // Consumed once on mount, then scrubbed from the URL so a refresh or
  // back-button trip doesn't re-apply the filter unexpectedly.
  const overdueParam = searchParams.get('overdue');
  const minDaysOverdueParam = searchParams.get('minDaysOverdue');
  const customerIdParam = searchParams.get('customerId');
  useEffect(() => {
    if (!overdueParam && !minDaysOverdueParam && !customerIdParam) return;
    // Skip the wrapper setOverdueOnly here — it clears minDaysOverdue,
    // which is exactly what the drill-through is trying to set.
    if (overdueParam === 'true') setOverdueOnlyState(true);
    if (minDaysOverdueParam) {
      const n = Number(minDaysOverdueParam);
      if (Number.isFinite(n) && n >= 0) setMinDaysOverdue(n);
    }
    if (customerIdParam) {
      const n = Number(customerIdParam);
      if (Number.isFinite(n) && n > 0) setCustomerId(n);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('overdue');
    url.searchParams.delete('minDaysOverdue');
    url.searchParams.delete('customerId');
    window.history.replaceState({}, '', url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PDF preview dialog
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewInvoiceId, setPdfPreviewInvoiceId] = useState<string | null>(null);

  // Debounced search
  const debouncedSearch = useDebounce(searchInput, 300);

  // Data
  const { data: summary, isLoading: summaryLoading } = useInvoiceSummary();
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (billingPathFilter !== 'all') params.billingPath = billingPathFilter;
    if (overdueOnly) params.overdueOnly = true;
    if (minDaysOverdue !== undefined) params.minDaysOverdue = minDaysOverdue;
    if (customerId !== undefined) params.customerId = customerId;
    if (debouncedSearch) params.search = debouncedSearch;
    if (sortBy) params.sortBy = sortBy;
    if (sortOrder) params.sortOrder = sortOrder;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    return params as {
      status?: string;
      billingPath?: string;
      overdueOnly?: boolean;
      minDaysOverdue?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }, [
    statusFilter,
    billingPathFilter,
    overdueOnly,
    minDaysOverdue,
    customerId,
    debouncedSearch,
    sortBy,
    sortOrder,
    dateFrom,
    dateTo,
  ]);

  const { data: invoices, isLoading: invoicesLoading } = useInvoices(queryParams);

  // Live sync: derive selectedInvoice from query cache so optimistic updates reflect immediately
  const liveInvoice = useMemo(() => {
    if (!selectedInvoiceId || !invoices) return null;
    return invoices.find((i) => i.invoiceNumber === selectedInvoiceId) ?? null;
  }, [selectedInvoiceId, invoices]);

  // Prefetch invoice detail on hover
  const queryClient = useQueryClient();
  const handlePrefetch = useCallback(
    (invoiceId: string) => {
      queryClient.prefetchQuery({
        queryKey: ['invoices', invoiceId],
        queryFn: () => invoicesApi.getById(invoiceId),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );

  // Selection helpers
  const allSelected = !!invoices?.length && selectedIds.size === invoices.length;
  const someSelected = selectedIds.size > 0 && invoices ? selectedIds.size < invoices.length : false;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set((invoices ?? []).map((inv) => inv.invoiceNumber)));
    }
  }, [allSelected, invoices]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Overdue detection helper
  const isOverdue = (inv: Invoice) => {
    if (['PAID', 'VOID', 'FACTORED', 'DRAFT'].includes(inv.status)) return false;
    return isCalendarDateOverdue(inv.dueDate);
  };

  // PDF helpers
  const handlePreviewPdf = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const blobUrl = await invoicesApi.getPreviewBlobUrl(invoiceId);
      setPdfPreviewUrl(blobUrl);
      setPdfPreviewInvoiceId(invoiceId);
      setPdfPreviewOpen(true);
    } catch {
      showError('Failed to load PDF preview');
    }
  };

  const handleDownloadPdf = (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    invoicesApi.downloadPdf(invoiceId);
  };

  return (
    <FeatureGuard featureKey="billing">
      <div className="space-y-6 pb-20">
        {/* Header */}
        <PageHeader
          title="Billing"
          subtitle={
            <>
              Invoices out, payments in.{' '}
              <Link
                href="/dispatcher/insights/ar-health"
                className="text-foreground underline-offset-4 hover:underline"
              >
                View AR health →
              </Link>
            </>
          }
        />

        {/* Recourse alert (RECOURSED invoices). Renders nothing when none — actionable, stays on workspace. */}
        <RecourseAlert invoices={invoices ?? []} onOpenInvoice={(invoiceId) => setSelectedInvoiceId(invoiceId)} />

        {/* Backfill verification banner. Renders nothing when no estimates exist — actionable, stays on workspace. */}
        <BackfillBanner />

        {/* AR aging + factoring diagnostics moved to /dispatcher/insights/ar-health
            (Phase A of the workspace ↔ insights split). KPI strip below stays — it's
            the glance numbers tied to today's work. See
            .docs/plans/18-reporting/2026-05-20-workspace-vs-insights-master-plan.md */}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Outstanding */}
          <Card
            className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            role="button"
            tabIndex={0}
            aria-label="Filter all outstanding invoices"
            onClick={() => {
              setStatusFilter('all');
              setOverdueOnly(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStatusFilter('all');
                setOverdueOnly(false);
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {summaryLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <div>
                  <div className="text-lg sm:text-2xl font-bold text-foreground">
                    {formatCents(summary?.outstandingCents ?? 0)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overdue */}
          <Card
            className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            role="button"
            tabIndex={0}
            aria-label="Filter overdue invoices"
            onClick={() => {
              setStatusFilter('all');
              setOverdueOnly(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStatusFilter('all');
                setOverdueOnly(true);
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Overdue</CardTitle>
              <AlertTriangle className="h-4 w-4 text-critical" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {summaryLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <div className="text-lg sm:text-2xl font-bold text-critical">
                  {formatCents(summary?.overdueCents ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Due This Week */}
          {!summaryLoading && (summary?.dueThisWeekCount ?? 0) > 0 && (
            <Card
              className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
              role="button"
              tabIndex={0}
              aria-label="Filter invoices due this week"
              onClick={() => {
                setStatusFilter('all');
                setOverdueOnly(false);
                setSortBy('dueDate');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setStatusFilter('all');
                  setOverdueOnly(false);
                  setSortBy('dueDate');
                }
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Due This Week</CardTitle>
                <CalendarClock className="h-4 w-4 text-caution" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-caution">
                  {formatCents(summary?.dueThisWeekCents ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.dueThisWeekCount} invoice{(summary?.dueThisWeekCount ?? 0) !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Paid This Month */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Paid This Month</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {summaryLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <div className="text-lg sm:text-2xl font-bold text-foreground">
                  {formatCents(summary?.paidThisMonthCents ?? 0)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Factored (conditional) */}
          {!summaryLoading && (summary?.factoredCount ?? 0) > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Factored</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div>
                  <div className="text-lg sm:text-2xl font-bold text-foreground">
                    {formatCents(summary?.factoredCents ?? 0)}
                  </div>
                  <Badge variant="muted" className="text-2xs mt-1">
                    {summary?.factoredCount} invoice
                    {(summary?.factoredCount ?? 0) !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Zone 3 — Filter bar (no redundant card title; the page header names the page) */}
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search invoices..."
          sort={
            <SortButton
              options={INVOICE_SORT_OPTIONS}
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
            dateFrom={dateFrom}
            dateTo={dateTo}
            defaultPreset="90d"
            onChange={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
            }}
          />

          {/* Status */}
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val);
              setOverdueOnly(false);
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="VIEWED">Viewed</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
              <SelectItem value="FACTORED">Factored</SelectItem>
            </SelectContent>
          </Select>

          {/* Billing Path */}
          <Select value={billingPathFilter} onValueChange={setBillingPathFilter}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Billing Path" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Paths</SelectItem>
              <SelectItem value="FACTORED">Factored</SelectItem>
              <SelectItem value="DIRECT">Direct</SelectItem>
              <SelectItem value="AMAZON">Amazon</SelectItem>
            </SelectContent>
          </Select>

          {/* Overdue toggle */}
          <Button
            variant={overdueOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setOverdueOnly(!overdueOnly)}
            className="whitespace-nowrap"
          >
            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
            Overdue Only
          </Button>

          {/* Drill-through pill from AR Health bucket — dismissible to widen back to all overdue */}
          {minDaysOverdue !== undefined && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setMinDaysOverdue(undefined)}
              className="whitespace-nowrap"
              aria-label="Clear AR Health bucket filter"
            >
              {minDaysOverdue}+ days overdue · ✕
            </Button>
          )}

          {/* Drill-through pill from AR Health customer breakdown — dismissible to widen back to all customers */}
          {customerId !== undefined && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setCustomerId(undefined)}
              className="whitespace-nowrap"
              aria-label="Clear customer filter"
            >
              Customer #{customerId} · ✕
            </Button>
          )}
        </FilterBar>

        {/* Zone 4 — Data */}
        <Card>
          <CardContent className="p-0 md:px-2 md:pb-2">
            {invoicesLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !invoices?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                No invoices found. Approve & invoice loads from Close-Out to see them here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          ref={(el) => {
                            if (el) {
                              (el as unknown as HTMLButtonElement).dataset.state = someSelected
                                ? 'indeterminate'
                                : allSelected
                                  ? 'checked'
                                  : 'unchecked';
                            }
                          }}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="hidden sm:table-cell">Customer</TableHead>
                      <TableHead className="hidden md:table-cell">Load</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="hidden sm:table-cell text-right">Balance</TableHead>
                      <TableHead className="hidden lg:table-cell">Invoice Date</TableHead>
                      <TableHead className="hidden lg:table-cell">Due Date</TableHead>
                      <TableHead className="hidden lg:table-cell">Payment Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Path</TableHead>
                      <TableHead className="hidden lg:table-cell">QB</TableHead>
                      <TableHead className="w-16 hidden md:table-cell" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const overdue = isOverdue(invoice);
                      const isDraft = invoice.status === 'DRAFT';
                      const isSelected = selectedIds.has(invoice.invoiceNumber);

                      return (
                        <TableRow
                          key={invoice.invoiceNumber}
                          className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                            overdue ? 'border-l-2 border-l-critical' : ''
                          } ${isDraft ? 'opacity-75' : ''}`}
                          onMouseEnter={() => handlePrefetch(invoice.invoiceNumber)}
                          onClick={() => setSelectedInvoiceId(invoice.invoiceNumber)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(invoice.invoiceNumber)} />
                          </TableCell>
                          <TableCell className="font-medium text-foreground">{invoice.invoiceNumber}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">
                            {invoice.customer?.companyName ?? '\u2014'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              {invoice.load?.loadNumber
                                ? formatLoadLabel(invoice.load.loadNumber, invoice.load.referenceNumber)
                                : '\u2014'}
                              {/* TODO: EDI badge requires load.intakeSource on the invoice response */}
                              {(invoice.load as Record<string, unknown> | null)?.intakeSource === 'edi' && (
                                <Badge
                                  variant="outline"
                                  className="text-violet-400 border-violet-500/30 text-2xs px-1.5 py-0"
                                >
                                  EDI
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-foreground">
                            {formatCents(invoice.totalCents)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-right text-foreground">
                            {formatCents(invoice.balanceCents)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">
                            {formatCalendarDate(invoice.issueDate, DISPLAY_FORMATS.FRIENDLY)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">
                            {formatCalendarDate(invoice.dueDate, DISPLAY_FORMATS.FRIENDLY)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <OverdueLabel dueDate={invoice.dueDate} status={invoice.status} />
                          </TableCell>
                          <TableCell>
                            <InvoiceStatusBadge status={invoice.status} />
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <BillingPathBadge billingPath={invoice.billingPath} />
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <AccountingSyncBadge
                              externalId={invoice.externalInvoiceId}
                              syncedAt={invoice.externalSyncedAt}
                              syncError={invoice.externalSyncError}
                            />
                          </TableCell>
                          <TableCell className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handlePreviewPdf(invoice.invoiceNumber, e)}
                                title="Preview PDF"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => handleDownloadPdf(invoice.invoiceNumber, e)}
                                title="Download PDF"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice Detail Sheet */}
      {liveInvoice && (
        <InvoiceDetailSheet
          invoice={liveInvoice}
          open={!!liveInvoice}
          onOpenChange={(open) => {
            if (!open) setSelectedInvoiceId(null);
          }}
        />
      )}

      {/* Batch Action Bar */}
      <BatchActionBar selectedIds={Array.from(selectedIds)} onClearSelection={clearSelection} />

      {/* Inline PDF Preview */}
      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onOpenChange={(next) => {
          setPdfPreviewOpen(next);
          if (!next && pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
            setPdfPreviewInvoiceId(null);
          }
        }}
        pdfUrl={pdfPreviewUrl}
        title={pdfPreviewInvoiceId ? `Invoice ${pdfPreviewInvoiceId}` : 'Invoice Preview'}
        onDownload={pdfPreviewInvoiceId ? () => invoicesApi.downloadPdf(pdfPreviewInvoiceId) : undefined}
      />
    </FeatureGuard>
  );
}
