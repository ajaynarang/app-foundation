'use client';

import { Card } from '@sally/ui/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useReportData } from '@/features/analytics/hooks/use-analytics';
import type { ReportType } from '@/features/analytics/types';

/**
 * Customer-level AR aging breakdown for the AR Health report. Pairs with
 * `<ArAgingTable />`'s tenant-level totals row — same 5 days-past-due
 * buckets, but here split by customer so a controller can see whose AR
 * is creating the totals above.
 *
 * Data source: `/analytics/reports/ar-aging` (the existing analytics
 * report endpoint). The `'ar-aging'` cast is the same seam documented on
 * the AR Health page — backend report identifier vs. frontend route slug
 * live in different layers and don't need to match.
 *
 * Clicking a customer name navigates to /dispatcher/billing?customerId=N
 * via `onCustomerClick`.
 */

interface CustomerAgingRow {
  customerId: number;
  companyName: string;
  currentCents: number;
  aging1to30Cents: number;
  aging31to60Cents: number;
  aging61to90Cents: number;
  aging90PlusCents: number;
  totalOutstandingCents: number;
}

interface ArAgingByCustomerProps {
  onCustomerClick?: (customerId: number) => void;
}

export function ArAgingByCustomer({ onCustomerClick }: ArAgingByCustomerProps = {}) {
  const { formatCents } = useFormatters();
  // Backend identifier stays `ar-aging` even though the frontend route is
  // `ar-health`. See the page-level comment for the rationale.
  const { data, isLoading } = useReportData('ar-aging' as ReportType);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data?.table || data.table.length === 0) return null;

  const rows = data.table as unknown as CustomerAgingRow[];

  return (
    <Card className="bg-card border-border p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground">By customer</h2>
        <p className="text-xs text-muted-foreground">
          Same 5 buckets, split by who owes you what. Click a customer to see their invoices.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Customer</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">1–30</TableHead>
            <TableHead className="text-right">31–60</TableHead>
            <TableHead className="text-right">61–90</TableHead>
            <TableHead className="text-right">90+</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isClickable = !!onCustomerClick;
            return (
              <TableRow
                key={row.customerId}
                className={isClickable ? 'cursor-pointer hover:bg-muted/50 transition-colors' : undefined}
                onClick={isClickable ? () => onCustomerClick!(row.customerId) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCustomerClick!(row.customerId);
                        }
                      }
                    : undefined
                }
                aria-label={isClickable ? `View ${row.companyName} invoices` : undefined}
              >
                <TableCell className="font-medium text-foreground">{row.companyName}</TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">{row.currentCents > 0 ? formatCents(row.currentCents) : '—'}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">
                    {row.aging1to30Cents > 0 ? formatCents(row.aging1to30Cents) : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">
                    {row.aging31to60Cents > 0 ? formatCents(row.aging31to60Cents) : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">
                    {row.aging61to90Cents > 0 ? formatCents(row.aging61to90Cents) : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">
                    {row.aging90PlusCents > 0 ? formatCents(row.aging90PlusCents) : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium text-foreground">
                  {formatCents(row.totalOutstandingCents)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
