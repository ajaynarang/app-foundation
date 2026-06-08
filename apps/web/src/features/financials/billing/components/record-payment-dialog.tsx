'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { useRecordPayment } from '../hooks/use-invoices';
import { formatCents } from '@/shared/lib/utils/formatters';

interface RecordPaymentDialogProps {
  invoiceId: string;
  balanceCents: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RecordPaymentDialog({ invoiceId, balanceCents, open, onOpenChange }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const recordPayment = useRecordPayment();

  const handleSubmit = () => {
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) return;

    recordPayment.mutate(
      {
        invoiceId,
        data: {
          amountCents,
          paymentMethod: method || undefined,
          referenceNumber: reference || undefined,
          paymentDate: date,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setAmount('');
          setMethod('');
          setReference('');
          setNotes('');
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!recordPayment.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            Balance due: <span className="font-semibold text-foreground">{formatCents(balanceCents)}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-amount">Amount ($)</Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={(balanceCents / 100).toFixed(2)}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-method">Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="payment-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="wire">Wire Transfer</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-ref">Reference Number</Label>
            <Input
              id="payment-ref"
              placeholder="e.g. CHK-12345"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-date">Payment Date</Label>
            <Input id="payment-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-notes">Notes</Label>
            <Textarea
              id="payment-notes"
              placeholder="Optional notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            loading={recordPayment.isPending}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            Record Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
