'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { useRecordFactoringTransaction } from '../hooks/use-factoring-transactions';
import type { FactoringTxnType, RecordFactoringTransactionInput } from '@sally/shared-types';
import type { Invoice } from '../types';

interface RecordTransactionDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetType: FactoringTxnType;
}

const TITLE: Record<FactoringTxnType, string> = {
  ADVANCE: 'Record advance',
  FEE: 'Record fee',
  RESERVE_RELEASE: 'Record reserve release',
  CHARGEBACK: 'Record chargeback',
  CHARGEBACK_REVERSAL: 'Record chargeback reversal',
};

const HELP: Record<FactoringTxnType, string> = {
  ADVANCE: 'Wire from factor — typically 90-95% of invoice total. Fee will be auto-recorded from the factor rate-card.',
  FEE: 'Manual fee not derived from rate-card (e.g. monthly minimum, late fee).',
  RESERVE_RELEASE: 'Factor releases the reserve after the broker pays. Transitions invoice to PAID.',
  CHARGEBACK: 'Factor charged back the advance. Transitions invoice to RECOURSED.',
  CHARGEBACK_REVERSAL: 'Factor refunded a chargeback. Transitions invoice back to FACTORED.',
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function suggestedAmountCents(invoice: Invoice, type: FactoringTxnType): number | undefined {
  if (type === 'ADVANCE' && invoice.totalCents) {
    return Math.round(invoice.totalCents * 0.95);
  }
  if (type === 'RESERVE_RELEASE') return invoice.reserveAmountCents ?? undefined;
  if (type === 'CHARGEBACK' || type === 'CHARGEBACK_REVERSAL') return invoice.advanceAmountCents ?? undefined;
  return undefined;
}

export function RecordTransactionDialog({ invoice, open, onOpenChange, presetType }: RecordTransactionDialogProps) {
  const [amountDollars, setAmountDollars] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayIsoDate());
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [autoRecordFee, setAutoRecordFee] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recordMutation = useRecordFactoringTransaction(invoice.invoiceNumber);

  useEffect(() => {
    if (open) {
      const suggested = suggestedAmountCents(invoice, presetType);
      setAmountDollars(suggested != null ? (suggested / 100).toFixed(2) : '');
      setTransactionDate(todayIsoDate());
      setReferenceNumber('');
      setNotes('');
      setAutoRecordFee(true);
      setError(null);
    }
  }, [open, presetType, invoice]);

  const handleSubmit = () => {
    const amt = Math.round(parseFloat(amountDollars) * 100);
    if (!Number.isFinite(amt) || amt < 1) {
      setError('Amount must be greater than zero');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      setError('Transaction date must be a valid YYYY-MM-DD');
      return;
    }
    setError(null);

    const ref = referenceNumber.trim() || undefined;
    const note = notes.trim() || undefined;
    let body: RecordFactoringTransactionInput;
    if (presetType === 'ADVANCE') {
      body = {
        type: 'ADVANCE',
        amountCents: amt,
        transactionDate,
        referenceNumber: ref,
        notes: note,
        autoRecordFee,
      };
    } else {
      body = {
        type: presetType,
        amountCents: amt,
        transactionDate,
        referenceNumber: ref,
        notes: note,
      };
    }

    recordMutation.mutate(body, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onKeyDown={handleKey}>
        <DialogHeader>
          <DialogTitle>{TITLE[presetType]}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{HELP[presetType]}</p>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txnDate">Transaction date</Label>
            <Input
              id="txnDate"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ref">Reference (optional)</Label>
            <Input
              id="ref"
              type="text"
              maxLength={100}
              placeholder="Wire number, check #, etc."
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          {presetType === 'ADVANCE' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={autoRecordFee} onCheckedChange={(v) => setAutoRecordFee(v === true)} />
              <span className="text-foreground">Auto-record FEE from factor rate-card</span>
            </label>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" maxLength={2000} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={recordMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={recordMutation.isPending}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
