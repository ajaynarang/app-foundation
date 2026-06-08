'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { cn } from '@sally/ui';
import { STATUS_VARIANTS } from '../constants';
import type { LoginActivityEvent } from '../types';
import { failReasonLabel, userDisplayName } from '../utils';
import { parseUaShort } from './_ua';

interface LoginActivityTableProps {
  mode: 'super-admin' | 'tenant-admin';
  items?: LoginActivityEvent[];
  total: number;
  limit: number;
  offset: number;
  isLoading: boolean;
  onRowClick: (event: LoginActivityEvent) => void;
  onPageChange: (nextOffset: number) => void;
}

/**
 * Server-paginated table of login events.
 *
 * - Mode-aware: hides the Tenant column in tenant-admin mode (all rows are this tenant).
 * - Responsive: IP, Device, Failure-reason columns hide below md/lg breakpoints.
 * - Loading: 10 row-shaped Skeletons (never spinner / never null).
 * - Empty: friendly message inside the bordered card.
 */
export function LoginActivityTable({
  mode,
  items,
  total,
  limit,
  offset,
  isLoading,
  onRowClick,
  onPageChange,
}: LoginActivityTableProps) {
  const showTenantColumn = mode === 'super-admin';

  if (isLoading && !items) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-12 text-center">
        <p className="text-sm text-foreground">No sign-ins match these filters</p>
        <p className="mt-1 text-xs text-muted-foreground">Try expanding the date range or clearing filters.</p>
      </div>
    );
  }

  const start = offset + 1;
  const end = Math.min(offset + items.length, total);
  const hasPrev = offset > 0;
  const hasNext = end < total;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              {showTenantColumn && <TableHead>Tenant</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">IP</TableHead>
              <TableHead className="hidden lg:table-cell">Device</TableHead>
              <TableHead className="hidden lg:table-cell">Failure reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((event) => {
              const variant = STATUS_VARIANTS[event.status];
              return (
                <TableRow key={event.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onRowClick(event)}>
                  <TableCell title={event.createdAt} className="whitespace-nowrap text-sm">
                    {new Date(event.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-foreground">{userDisplayName(event.user)}</div>
                    {event.user && <div className="text-xs text-muted-foreground">{event.user.email}</div>}
                  </TableCell>
                  {showTenantColumn && (
                    <TableCell className="text-sm">
                      {event.tenant ? event.tenant.name : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge className={cn('px-2 py-0.5 text-xs font-medium', variant.className)}>{variant.label}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{event.ip ?? '—'}</TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {event.deviceLabel ?? parseUaShort(event.userAgent)}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {failReasonLabel(event.failReason) ?? '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {start}–{end} of {total}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            Prev
          </Button>
          <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => onPageChange(offset + limit)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
