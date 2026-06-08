'use client';

import { DollarSign, Check, X, Clock, Loader2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { MoneyCodeDisplay } from './MoneyCodeDisplay';
import { useCancelMoneyCode } from '@/features/fleet/loads/hooks/use-money-codes';
import type { MoneyCode } from '@sally/shared-types';

interface LumperStatusCardProps {
  moneyCode: MoneyCode;
  loadId: string;
  onUploadReceipt?: () => void;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  REQUESTED: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Waiting for dispatch' },
  APPROVED: { icon: DollarSign, color: 'text-green-400', bg: 'bg-green-400/10', label: 'Approved' },
  USED: { icon: Check, color: 'text-green-400', bg: 'bg-green-400/10', label: 'Receipt uploaded' },
  DENIED: { icon: X, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Denied' },
  CANCELLED: { icon: X, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Cancelled' },
  EXPIRED: { icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Expired' },
};

export function LumperStatusCard({ moneyCode, loadId, onUploadReceipt }: LumperStatusCardProps) {
  const cancelMutation = useCancelMoneyCode();
  const config = STATUS_CONFIG[moneyCode.status] ?? STATUS_CONFIG.REQUESTED;
  const StatusIcon = config.icon;
  const isDimmed = moneyCode.status === 'CANCELLED' || moneyCode.status === 'EXPIRED';

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden transition-opacity',
        isDimmed && 'opacity-50',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/50">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', config.bg)}>
          {moneyCode.status === 'REQUESTED' ? (
            <Loader2 className={cn('h-3.5 w-3.5 animate-spin', config.color)} />
          ) : (
            <StatusIcon className={cn('h-3.5 w-3.5', config.color)} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">Lumper — ${(moneyCode.requestedCents / 100).toFixed(2)}</p>
          <p className={cn('text-2xs', config.color)}>{config.label}</p>
        </div>
        <span className="text-2xs text-muted-foreground uppercase">{moneyCode.method}</span>
      </div>

      {/* Body — varies by status */}
      <div className="px-3 py-2.5">
        {moneyCode.status === 'REQUESTED' && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Your request has been sent to dispatch</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7"
              loading={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ loadId, moneyCodeId: moneyCode.moneyCodeId })}
            >
              Cancel
            </Button>
          </div>
        )}

        {moneyCode.status === 'APPROVED' && moneyCode.code && (
          <div className="space-y-3">
            <MoneyCodeDisplay
              code={moneyCode.code}
              amountCents={moneyCode.amountCents}
              method={moneyCode.method}
              expiresAt={moneyCode.expiresAt}
            />
            {onUploadReceipt && (
              <Button className="w-full" onClick={onUploadReceipt}>
                Upload Receipt
              </Button>
            )}
          </div>
        )}

        {moneyCode.status === 'USED' && (
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
            <p className="text-xs text-muted-foreground">
              ${(moneyCode.amountCents / 100).toFixed(2)} via {moneyCode.method.toUpperCase()}
              {moneyCode.code && ` · Code: ${moneyCode.code}`}
            </p>
          </div>
        )}

        {moneyCode.status === 'DENIED' && moneyCode.dispatcherNote && (
          <p className="text-xs text-muted-foreground italic">{moneyCode.dispatcherNote}</p>
        )}
      </div>
    </div>
  );
}
