'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@sally/ui/components/ui/table';
import { formatCents } from '@/shared/lib/utils/formatters';
import type { IftaStateCalculation } from '../types';

interface IftaStateBreakdownTableProps {
  breakdown: IftaStateCalculation[];
}

export function IftaStateBreakdownTable({ breakdown }: IftaStateBreakdownTableProps) {
  if (!breakdown.length) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No state breakdown data available. Run a calculation to see per-state details.
      </div>
    );
  }

  const totalMiles = breakdown.reduce((sum, s) => sum + s.totalMiles, 0);
  const totalTaxableGal = breakdown.reduce((sum, s) => sum + s.taxableGallons, 0);
  const totalFuelPurchased = breakdown.reduce((sum, s) => sum + s.fuelPurchasedGallons, 0);
  const totalTaxOwed = breakdown.reduce((sum, s) => sum + s.taxOwedCents, 0);
  const totalTaxPaid = breakdown.reduce((sum, s) => sum + s.taxPaidCents, 0);
  const totalNet = breakdown.reduce((sum, s) => sum + s.netTaxCents, 0);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>State</TableHead>
            <TableHead className="text-right">Miles</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Taxable Gal</TableHead>
            <TableHead className="text-right">Fuel Purchased</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Rate</TableHead>
            <TableHead className="text-right">Tax Owed</TableHead>
            <TableHead className="text-right">Tax Paid</TableHead>
            <TableHead className="text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {breakdown.map((row) => (
            <TableRow key={row.jurisdiction}>
              <TableCell className="font-medium text-foreground">
                {row.jurisdictionName} ({row.jurisdiction})
              </TableCell>
              <TableCell className="text-right text-foreground tabular-nums">
                {row.totalMiles.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                {row.taxableGallons.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {row.fuelPurchasedGallons.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                ${row.taxRate.toFixed(4)}
              </TableCell>
              <TableCell className="text-right text-foreground tabular-nums">{formatCents(row.taxOwedCents)}</TableCell>
              <TableCell className="text-right text-foreground tabular-nums">{formatCents(row.taxPaidCents)}</TableCell>
              <TableCell
                className={`text-right font-medium tabular-nums ${
                  row.netTaxCents > 0 ? 'text-critical' : row.netTaxCents < 0 ? 'text-info' : 'text-foreground'
                }`}
              >
                {formatCents(row.netTaxCents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold text-foreground">Total</TableCell>
            <TableCell className="text-right font-semibold text-foreground tabular-nums">
              {totalMiles.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-semibold text-muted-foreground tabular-nums hidden sm:table-cell">
              {totalTaxableGal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </TableCell>
            <TableCell className="text-right font-semibold text-muted-foreground tabular-nums">
              {totalFuelPurchased.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </TableCell>
            <TableCell className="hidden sm:table-cell" />
            <TableCell className="text-right font-semibold text-foreground tabular-nums">
              {formatCents(totalTaxOwed)}
            </TableCell>
            <TableCell className="text-right font-semibold text-foreground tabular-nums">
              {formatCents(totalTaxPaid)}
            </TableCell>
            <TableCell
              className={`text-right font-semibold tabular-nums ${
                totalNet > 0 ? 'text-critical' : totalNet < 0 ? 'text-info' : 'text-foreground'
              }`}
            >
              {formatCents(totalNet)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
