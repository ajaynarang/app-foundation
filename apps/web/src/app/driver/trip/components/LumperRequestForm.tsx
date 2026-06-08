'use client';

import { useState, useCallback } from 'react';
import { DollarSign } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { cn } from '@sally/ui';
import { useCreateMoneyCode } from '@/features/fleet/loads/hooks/use-money-codes';

const QUICK_AMOUNTS = [15000, 20000, 32000, 50000]; // cents
const METHODS = [
  { value: 'comchek', label: 'Comchek' },
  { value: 'efs', label: 'EFS' },
  { value: 'cash', label: 'Cash' },
] as const;

interface LumperRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  stopId?: number;
}

export function LumperRequestForm({ open, onOpenChange, loadId, stopId }: LumperRequestFormProps) {
  const [amountCents, setAmountCents] = useState(0);
  const [method, setMethod] = useState<string>('comchek');
  const [note, setNote] = useState('');
  const createMutation = useCreateMoneyCode();

  const resetAndClose = useCallback(() => {
    setAmountCents(0);
    setMethod('comchek');
    setNote('');
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = useCallback(() => {
    if (amountCents < 100) return;
    createMutation.mutate(
      { loadId, requestedCents: amountCents, method, stopId, driverNote: note || undefined },
      { onSuccess: () => resetAndClose() },
    );
  }, [amountCents, method, note, loadId, stopId, createMutation, resetAndClose]);

  const displayAmount = (amountCents / 100).toFixed(2);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-400/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-green-400" />
            </div>
            Request Lumper Funds
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5">
          {/* Amount display */}
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground tabular-nums">${displayAmount}</p>
            <p className="text-xs text-muted-foreground mt-1">Enter amount below</p>
          </div>

          {/* Quick amount chips */}
          <div className="flex gap-2 justify-center">
            {QUICK_AMOUNTS.map((cents) => (
              <button
                key={cents}
                type="button"
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                  amountCents === cents
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
                onClick={() => setAmountCents(cents)}
              >
                ${(cents / 100).toFixed(0)}
              </button>
            ))}
          </div>

          {/* Manual amount input */}
          <div>
            <Label htmlFor="amount" className="text-xs text-muted-foreground">
              Custom Amount
            </Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amountCents ? (amountCents / 100).toString() : ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setAmountCents(isNaN(val) ? 0 : Math.round(val * 100));
              }}
              className="mt-1"
            />
          </div>

          {/* Payment method toggle */}
          <div>
            <Label className="text-xs text-muted-foreground">Payment Method</Label>
            <div className="flex items-center rounded-full border border-border bg-muted/30 p-0.5 mt-1">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={cn(
                    'flex-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all text-center',
                    method === m.value
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setMethod(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <Label htmlFor="note" className="text-xs text-muted-foreground">
              Note (optional)
            </Label>
            <Textarea
              id="note"
              placeholder="e.g. Lumper says $320 firm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 resize-none"
              rows={2}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={amountCents < 100}
              loading={createMutation.isPending}
              onClick={handleSubmit}
            >
              Request ${amountCents >= 100 ? (amountCents / 100).toFixed(2) : '0.00'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
