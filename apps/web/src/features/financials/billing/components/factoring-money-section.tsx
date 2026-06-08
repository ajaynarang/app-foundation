'use client';

import { Card } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Button } from '@sally/ui/components/ui/button';
import { Plus, Minus, AlertCircle } from 'lucide-react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useFactoringTransactions } from '../hooks/use-factoring-transactions';
import type { FactoringTransaction, FactoringTxnType } from '@sally/shared-types';
import type { Invoice } from '../types';

interface FactoringMoneySectionProps {
  invoice: Invoice;
  onRecord: (preset: FactoringTxnType) => void;
}

const TXN_LABEL: Record<FactoringTxnType, string> = {
  ADVANCE: 'Advance',
  FEE: 'Fee',
  RESERVE_RELEASE: 'Reserve release',
  CHARGEBACK: 'Chargeback',
  CHARGEBACK_REVERSAL: 'Reversal',
};

const TXN_DIRECTION: Record<FactoringTxnType, 'credit' | 'debit'> = {
  ADVANCE: 'credit',
  RESERVE_RELEASE: 'credit',
  FEE: 'debit',
  CHARGEBACK: 'debit',
  CHARGEBACK_REVERSAL: 'credit',
};

export function FactoringMoneySection({ invoice, onRecord }: FactoringMoneySectionProps) {
  const { formatCents, formatCalendarDate } = useFormatters();
  const { data: txns, isLoading } = useFactoringTransactions(invoice.invoiceNumber);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const advance = invoice.advanceAmountCents ?? 0;
  const fee = invoice.factoringFeeCents ?? 0;
  const reserve = invoice.reserveAmountCents ?? 0;
  const reserveReleased = !!invoice.reserveReleasedAt;
  const netToCarrier = advance + (reserveReleased ? reserve : 0);
  const isRecoursed = invoice.status === 'RECOURSED';
  const hasAdvance = advance > 0;

  return (
    <Card className="bg-card border-border space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Factoring</h3>
        {isRecoursed && (
          <div className="flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Recourse — chargeback active</span>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Total</dt>
        <dd className="text-right font-medium text-foreground">{formatCents(invoice.totalCents)}</dd>

        <dt className="text-muted-foreground">
          Advance
          {invoice.advanceReceivedAt && (
            <span className="ml-1 text-xs text-muted-foreground">
              · {formatCalendarDate(invoice.advanceReceivedAt)}
            </span>
          )}
        </dt>
        <dd className="text-right font-medium text-foreground">
          {hasAdvance ? formatCents(advance) : <span className="text-muted-foreground">—</span>}
        </dd>

        <dt className="text-muted-foreground">Fee</dt>
        <dd className="text-right font-medium text-red-500 dark:text-red-400">
          {fee > 0 ? `−${formatCents(fee)}` : <span className="text-muted-foreground">—</span>}
        </dd>

        <dt className="text-muted-foreground">
          Reserve
          {invoice.reserveReleasedAt && (
            <span className="ml-1 text-xs text-muted-foreground">
              · released {formatCalendarDate(invoice.reserveReleasedAt)}
            </span>
          )}
        </dt>
        <dd className="text-right font-medium text-foreground">
          {reserve > 0 ? formatCents(reserve) : <span className="text-muted-foreground">—</span>}
        </dd>

        <dt className="border-t border-border pt-2 font-semibold text-foreground">Net to carrier</dt>
        <dd className="border-t border-border pt-2 text-right font-semibold text-foreground">
          {formatCents(netToCarrier)}
        </dd>
      </dl>

      <div className="flex flex-wrap gap-2 pt-2">
        {!hasAdvance && (
          <Button size="sm" onClick={() => onRecord('ADVANCE')} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Record advance
          </Button>
        )}
        {hasAdvance && !reserveReleased && !isRecoursed && (
          <Button size="sm" variant="outline" onClick={() => onRecord('RESERVE_RELEASE')} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Record reserve release
          </Button>
        )}
        {hasAdvance && !isRecoursed && (
          <Button size="sm" variant="outline" onClick={() => onRecord('CHARGEBACK')} className="gap-1">
            <Minus className="h-3.5 w-3.5" /> Record chargeback
          </Button>
        )}
        {isRecoursed && (
          <Button size="sm" onClick={() => onRecord('CHARGEBACK_REVERSAL')} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Record chargeback reversal
          </Button>
        )}
        {hasAdvance && (
          <Button size="sm" variant="ghost" onClick={() => onRecord('FEE')} className="gap-1 text-muted-foreground">
            <Plus className="h-3.5 w-3.5" /> Record additional fee
          </Button>
        )}
      </div>

      {txns && txns.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline</h4>
          <ul className="space-y-1.5 text-sm">
            {txns.map((t: FactoringTransaction) => (
              <li
                key={t.transactionId}
                className="flex items-center justify-between gap-2 border-b border-border/50 py-1 last:border-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-foreground">{TXN_LABEL[t.type]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCalendarDate(t.transactionDate)}
                    {t.referenceNumber && <> · ref {t.referenceNumber}</>}
                    {(t.metadata as Record<string, unknown> | null | undefined)?.estimated === true && (
                      <>
                        {' '}
                        · <span className="text-yellow-600 dark:text-yellow-400">estimated</span>
                      </>
                    )}
                  </span>
                </div>
                <span
                  className={
                    TXN_DIRECTION[t.type] === 'credit'
                      ? 'font-medium text-foreground'
                      : 'font-medium text-red-500 dark:text-red-400'
                  }
                >
                  {TXN_DIRECTION[t.type] === 'credit' ? '+' : '−'}
                  {formatCents(t.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
