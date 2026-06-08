'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showError, showSuccess } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { queryKeys } from '@/shared/constants';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { invoicesApi } from '../api';
import { useNoaRecords } from '../hooks/use-noa';
import { NoaStatusBadge } from './noa-status-badge';
import { SendNoaDialog, type SendNoaDialogContext } from './send-noa-dialog';

interface NoaSectionProps {
  customerId: number | null | undefined;
  customerName: string;
}

type NoaStatusValue = 'NOT_SENT' | 'SENT' | 'ACKNOWLEDGED' | 'REJECTED';

export function NoaSection({ customerId, customerName }: NoaSectionProps) {
  const { data, isLoading } = useNoaRecords(customerId ?? undefined);
  const queryClient = useQueryClient();
  const [sendCtx, setSendCtx] = useState<SendNoaDialogContext | null>(null);

  const markAckMutation = useMutation({
    mutationFn: (noaId: string) => invoicesApi.updateNoaStatus(noaId, { status: 'ACKNOWLEDGED' }),
    onSuccess: () => {
      showSuccess('NOA marked acknowledged');
      queryClient.invalidateQueries({ queryKey: queryKeys.noaRecords.root });
    },
    onError: (error: Error) => showError('Could not update NOA', extractErrorMessage(error)),
  });

  if (!customerId) return null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const records = data ?? [];
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">No NOAs on file for this customer.</p>;
  }

  return (
    <div className="space-y-2">
      {records.map((noa) => {
        const status = noa.status as NoaStatusValue;
        const factorName = noa.factoringCompany?.companyName ?? `Factor #${noa.factoringCompanyId}`;
        return (
          <div
            key={noa.noaId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{factorName}</span>
                <NoaStatusBadge status={status} />
              </div>
              <div className="text-xs text-muted-foreground">
                {noa.sentAt
                  ? `Sent ${formatRelativeTime(noa.sentAt)}`
                  : status === 'NOT_SENT'
                    ? 'Not yet sent'
                    : `Updated ${formatRelativeTime(noa.updatedAt)}`}
                {status === 'REJECTED' && noa.rejectionReason ? ` · ${noa.rejectionReason}` : ''}
              </div>
            </div>
            <div className="flex gap-1">
              {(status === 'NOT_SENT' || status === 'REJECTED') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSendCtx({
                      noaId: noa.noaId,
                      customerName,
                      factoringCompanyName: factorName,
                    })
                  }
                  aria-label={`Send NOA for ${factorName}`}
                >
                  {status === 'REJECTED' ? 'Resend' : 'Send'}
                </Button>
              )}
              {status === 'SENT' && (
                <Button
                  size="sm"
                  variant="outline"
                  loading={markAckMutation.isPending && markAckMutation.variables === noa.noaId}
                  onClick={() => markAckMutation.mutate(noa.noaId)}
                  aria-label={`Mark acknowledged for ${factorName}`}
                >
                  Mark ack
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <SendNoaDialog open={!!sendCtx} onOpenChange={(open) => !open && setSendCtx(null)} context={sendCtx} />
    </div>
  );
}
