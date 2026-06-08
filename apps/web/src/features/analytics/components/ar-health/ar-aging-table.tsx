'use client';

import { Card } from '@sally/ui/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useInvoiceSummary } from '@/features/financials/billing/hooks/use-invoices';

/**
 * AR aging buckets keyed in the same shape the backend returns. Direct +
 * Factored are rendered as separate columns alongside Total per the Phase 4
 * spec. Hidden when the tenant has no AR activity at all.
 */
type Bucket = { amountCents: number; count: number };
type AgingShape = {
  current: Bucket;
  days1_30: Bucket;
  days31_60: Bucket;
  days61_90: Bucket;
  daysOver90: Bucket;
};

/** Bucket key shared by both the component and any caller that wants to react to bucket clicks. */
export type AgingBucketKey = keyof AgingShape;

/**
 * Minimum days-overdue for each bucket. `current` has no overdue threshold —
 * it's the "not yet due" bucket and isn't a sensible drill-through target.
 * The `daysOver90` lower bound is 91 so the URL matches the visible label
 * (the > sign reads naturally as "past 90").
 */
export const AGING_MIN_DAYS_OVERDUE: Record<Exclude<AgingBucketKey, 'current'>, number> = {
  days1_30: 1,
  days31_60: 31,
  days61_90: 61,
  daysOver90: 91,
};

const ROWS: Array<{ key: AgingBucketKey; label: string }> = [
  { key: 'current', label: 'Current' },
  { key: 'days1_30', label: '1–30 days' },
  { key: 'days31_60', label: '31–60 days' },
  { key: 'days61_90', label: '61–90 days' },
  { key: 'daysOver90', label: '90+ days' },
];

const EMPTY: AgingShape = {
  current: { amountCents: 0, count: 0 },
  days1_30: { amountCents: 0, count: 0 },
  days31_60: { amountCents: 0, count: 0 },
  days61_90: { amountCents: 0, count: 0 },
  daysOver90: { amountCents: 0, count: 0 },
};

function totalCents(buckets: AgingShape): number {
  return ROWS.reduce((sum, r) => sum + buckets[r.key].amountCents, 0);
}

interface ArAgingTableProps {
  /**
   * Invoked when a bucket row is clicked. When omitted, rows are not
   * interactive. The 'current' bucket is never clickable (it's not overdue).
   */
  onBucketClick?: (bucket: AgingBucketKey) => void;
}

export function ArAgingTable({ onBucketClick }: ArAgingTableProps = {}) {
  const { formatCents } = useFormatters();
  const { data, isLoading } = useInvoiceSummary();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data) return null;

  // Backend wire shape uses snake-case keys (days1_30); shared-types schema
  // uses camelCase (days1To30). Cast through unknown — consumers of this
  // component don't care which shape and we're tolerant to either.
  const direct = ((data as unknown as { aging?: AgingShape }).aging ?? EMPTY) as AgingShape;
  const factored = ((data as unknown as { factoredAging?: AgingShape }).factoredAging ?? EMPTY) as AgingShape;

  const directTotal = totalCents(direct);
  const factoredTotal = totalCents(factored);
  const grandTotal = directTotal + factoredTotal;

  // No AR activity → render nothing (component is purely additive).
  if (grandTotal === 0) return null;

  return (
    <Card className="bg-card border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">AR aging</h2>
          <p className="text-xs text-muted-foreground">
            Direct = bill-to-broker. Factored = submitted to factor; broker still owes the factor.
          </p>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Bucket</TableHead>
            <TableHead className="text-right">Direct</TableHead>
            <TableHead className="text-right">Factored</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((row) => {
            const d = direct[row.key];
            const f = factored[row.key];
            const total = d.amountCents + f.amountCents;
            const isClickable = !!onBucketClick && row.key !== 'current' && total > 0;
            return (
              <TableRow
                key={row.key}
                className={isClickable ? 'cursor-pointer hover:bg-muted/50 transition-colors' : undefined}
                onClick={isClickable ? () => onBucketClick!(row.key) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onBucketClick!(row.key);
                        }
                      }
                    : undefined
                }
                aria-label={isClickable ? `View ${row.label} invoices` : undefined}
              >
                <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">{d.amountCents > 0 ? formatCents(d.amountCents) : '—'}</span>
                  {d.count > 0 && <span className="ml-1 text-xs text-muted-foreground">({d.count})</span>}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-foreground">{f.amountCents > 0 ? formatCents(f.amountCents) : '—'}</span>
                  {f.count > 0 && <span className="ml-1 text-xs text-muted-foreground">({f.count})</span>}
                </TableCell>
                <TableCell className="text-right font-medium text-foreground">
                  {total > 0 ? formatCents(total) : '—'}
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow className="border-t-2 border-border">
            <TableCell className="font-semibold text-foreground">Total</TableCell>
            <TableCell className="text-right font-semibold text-foreground">{formatCents(directTotal)}</TableCell>
            <TableCell className="text-right font-semibold text-foreground">{formatCents(factoredTotal)}</TableCell>
            <TableCell className="text-right font-semibold text-foreground">{formatCents(grandTotal)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
}
