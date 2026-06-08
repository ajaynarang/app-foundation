'use client';

import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@sally/ui/components/ui/table';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import type { ReportColumn } from '../types';

interface ReportTableProps {
  columns?: ReportColumn[];
  data?: Record<string, unknown>[];
  isLoading?: boolean;
}

function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: cols }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rIdx) => (
              <TableRow key={rIdx}>
                {Array.from({ length: cols }).map((_, cIdx) => (
                  <TableCell key={cIdx}>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function ReportTable({ columns, data, isLoading }: ReportTableProps) {
  const { formatCents } = useFormatters();

  // Preserve server-side ordering (backend already sorts by revenue/priority)
  const sortedData = data ?? [];

  if (isLoading) {
    return <TableSkeleton />;
  }

  if (!columns || columns.length === 0 || !data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No table data available</p>
        </CardContent>
      </Card>
    );
  }

  function formatCell(value: unknown, format?: ReportColumn['format']): string {
    if (value === null || value === undefined) return '--';
    switch (format) {
      case 'currency':
        return formatCents(Number(value));
      case 'percent':
        return `${Number(value).toFixed(1)}%`;
      case 'number':
        return Number(value).toLocaleString();
      case 'date':
        return String(value);
      case 'text':
      default:
        return String(value);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-xs">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row, rIdx) => (
                <TableRow key={rIdx}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-sm">
                      {formatCell(row[col.key], col.format)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
