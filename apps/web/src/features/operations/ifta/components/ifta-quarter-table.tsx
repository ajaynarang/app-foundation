'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { formatCents } from '@/shared/lib/utils/formatters';
import { IftaFilingStatusBadge } from './ifta-filing-status-badge';
import { QUARTER_LABELS } from '../constants';
import type { IftaQuarter } from '../types';

interface IftaQuarterTableProps {
  quarters: IftaQuarter[] | undefined;
  isLoading: boolean;
  onSelectQuarter: (quarterId: string) => void;
}

function formatDeadline(quarter: number, year: number): string {
  // IFTA deadlines: Q1 Apr 30, Q2 Jul 31, Q3 Oct 31, Q4 Jan 31 (next year)
  const deadlines: Record<number, string> = {
    1: `Apr 30, ${year}`,
    2: `Jul 31, ${year}`,
    3: `Oct 31, ${year}`,
    4: `Jan 31, ${year + 1}`,
  };
  return deadlines[quarter] ?? '';
}

export function IftaQuarterTable({ quarters, isLoading, onSelectQuarter }: IftaQuarterTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!quarters?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No IFTA quarters found. Quarters are created automatically when fuel or mileage data is available.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quarter</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Miles</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Fuel (gal)</TableHead>
            <TableHead className="text-right">Net Due</TableHead>
            <TableHead className="hidden sm:table-cell">Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quarters.map((q) => (
            <TableRow
              key={q.id}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
              onClick={() => onSelectQuarter(q.id)}
            >
              <TableCell className="font-medium text-foreground">
                {QUARTER_LABELS[q.quarter]} {q.year}
              </TableCell>
              <TableCell>
                <IftaFilingStatusBadge status={q.status} />
              </TableCell>
              <TableCell className="text-right text-foreground tabular-nums">
                {q.totalMiles != null ? q.totalMiles.toLocaleString() : '\u2014'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums hidden sm:table-cell">
                {q.totalGallons != null
                  ? q.totalGallons.toLocaleString(undefined, { maximumFractionDigits: 1 })
                  : '\u2014'}
              </TableCell>
              <TableCell className="text-right text-foreground tabular-nums">
                {q.netTaxDueCents != null ? formatCents(q.netTaxDueCents) : '\u2014'}
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {formatDeadline(q.quarter, q.year)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
