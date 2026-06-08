'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { formatLoadLabel } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { BillingStatusBadge } from './billing-status-badge';
import { formatCents } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import type { CloseOutLoad } from '../types';

interface Props {
  loads: CloseOutLoad[];
  loading: boolean;
  onReview: (load: CloseOutLoad) => void;
  onInvoice: (load: CloseOutLoad) => void;
}

export function CloseOutTable({ loads, loading, onReview, onInvoice }: Props) {
  const { formatTimestamp } = useFormatters();
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!loads.length) {
    return <div className="text-center py-12 text-muted-foreground">All caught up — no loads to close out.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Load #</TableHead>
            <TableHead className="hidden sm:table-cell">Customer</TableHead>
            <TableHead className="hidden md:table-cell">Route</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="hidden lg:table-cell">Delivered</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loads.map((load) => {
            const isOverdue =
              load.billingStatus === 'PENDING_DOCUMENTS' &&
              !!load.deliveredAt &&
              Date.now() - new Date(load.deliveredAt).getTime() > 48 * 60 * 60 * 1000;

            return (
              <TableRow
                key={load.loadNumber}
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                onClick={() => onReview(load)}
              >
                <TableCell className="font-medium text-foreground">
                  {formatLoadLabel(load.loadNumber, load.referenceNumber)}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-foreground">{load.customerName}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {load.originCity && load.destinationCity ? `${load.originCity} → ${load.destinationCity}` : '—'}
                </TableCell>
                <TableCell className="text-foreground">
                  {formatCents(load.chargeTotalCents || load.rateCents || 0)}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {load.deliveredAt ? formatTimestamp(load.deliveredAt, DISPLAY_FORMATS.FRIENDLY) : '—'}
                </TableCell>
                <TableCell>
                  <BillingStatusBadge status={load.billingStatus} overdue={isOverdue} />
                </TableCell>
                <TableCell className="text-right">
                  {load.billingStatus === 'APPROVED' ? (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInvoice(load);
                      }}
                    >
                      Invoice
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReview(load);
                      }}
                    >
                      Review
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
