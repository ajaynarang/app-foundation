'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { showError, showSuccess } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { invoicesApi } from '../api';
import { useFactoringCompanies } from '../hooks/use-invoices';
import { useNoaInbox } from '../hooks/use-noa';
import { NoaStatusBadge } from './noa-status-badge';
import { SendNoaDialog, type SendNoaDialogContext } from './send-noa-dialog';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'NOT_SENT', label: 'Not sent' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

const AGE_OPTIONS = [
  { value: 'all', label: 'Any age' },
  { value: 'pending_gt_14', label: 'Pending > 14 days' },
  { value: 'rejected', label: 'Rejected' },
] as const;

type AgeBucket = 'all' | 'pending_gt_14' | 'rejected';
type NoaStatusValue = 'NOT_SENT' | 'SENT' | 'ACKNOWLEDGED' | 'REJECTED';

export function NoaInbox() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ageFilter, setAgeFilter] = useState<AgeBucket>('all');
  const [factorFilter, setFactorFilter] = useState<string>('all');
  const [offset, setOffset] = useState(0);
  const [sendCtx, setSendCtx] = useState<SendNoaDialogContext | null>(null);

  const { data: factors, isLoading: factorsLoading } = useFactoringCompanies();
  const queryClient = useQueryClient();

  const filters = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      factorId: factorFilter === 'all' ? undefined : Number(factorFilter),
      ageBucket: ageFilter,
      limit: PAGE_SIZE,
      offset,
    }),
    [statusFilter, factorFilter, ageFilter, offset],
  );

  const { data, isLoading } = useNoaInbox(filters);

  const markAckMutation = useMutation({
    mutationFn: (noaId: string) => invoicesApi.updateNoaStatus(noaId, { status: 'ACKNOWLEDGED' }),
    onSuccess: () => {
      showSuccess('NOA marked acknowledged');
      queryClient.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
    },
    onError: (error: Error) => showError('Could not update NOA', extractErrorMessage(error)),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + items.length, total);

  const resetOffset = () => setOffset(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            resetOffset();
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={ageFilter}
          onValueChange={(v) => {
            setAgeFilter(v as AgeBucket);
            resetOffset();
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filter by age">
            <SelectValue placeholder="Age" />
          </SelectTrigger>
          <SelectContent>
            {AGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={factorFilter}
          onValueChange={(v) => {
            setFactorFilter(v);
            resetOffset();
          }}
          disabled={factorsLoading}
        >
          <SelectTrigger className="w-full sm:w-[220px]" aria-label="Filter by factor">
            <SelectValue placeholder="Factor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All factors</SelectItem>
            {factors?.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.companyName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No NOAs match these filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Factor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Sent</TableHead>
                  <TableHead className="hidden lg:table-cell">Last update</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const status = row.status as NoaStatusValue;
                  const sendable = status === 'NOT_SENT' || status === 'REJECTED';
                  const acknowledgeable = status === 'SENT';
                  return (
                    <TableRow key={row.noaId}>
                      <TableCell className="font-medium text-foreground">{row.customerName}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {row.factoringCompanyName}
                      </TableCell>
                      <TableCell>
                        <NoaStatusBadge status={status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {row.sentAt ? formatRelativeTime(row.sentAt) : '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {formatRelativeTime(row.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {sendable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSendCtx({
                                  noaId: row.noaId,
                                  customerName: row.customerName,
                                  factoringCompanyName: row.factoringCompanyName,
                                })
                              }
                              aria-label={`Send NOA to ${row.customerName}`}
                            >
                              {status === 'REJECTED' ? 'Resend' : 'Send'}
                            </Button>
                          )}
                          {acknowledgeable && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={markAckMutation.isPending && markAckMutation.variables === row.noaId}
                              onClick={() => markAckMutation.mutate(row.noaId)}
                              aria-label={`Mark NOA acknowledged for ${row.customerName}`}
                            >
                              Mark ack
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {start}–{end} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
              >
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={end >= total}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <SendNoaDialog open={!!sendCtx} onOpenChange={(open) => !open && setSendCtx(null)} context={sendCtx} />
    </div>
  );
}
