'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { useApproveMoneyCode, useDenyMoneyCode } from '@/features/fleet/loads/hooks/use-money-codes';

interface MoneyCodeEntryProps {
  loadId: string;
  moneyCodeId: string;
  requestedCents: number;
  method: string;
  onComplete?: () => void;
}

export function MoneyCodeEntry({ loadId, moneyCodeId, requestedCents, method, onComplete }: MoneyCodeEntryProps) {
  const [code, setCode] = useState('');
  const [amountCents, setAmountCents] = useState(requestedCents);
  const [note, setNote] = useState('');
  const approveMutation = useApproveMoneyCode();
  const denyMutation = useDenyMoneyCode();

  const handleApprove = useCallback(() => {
    if (!code.trim()) return;
    approveMutation.mutate(
      { loadId, moneyCodeId, code: code.trim(), amountCents, dispatcherNote: note || undefined },
      { onSuccess: () => onComplete?.() },
    );
  }, [code, amountCents, note, loadId, moneyCodeId, approveMutation, onComplete]);

  // Keyboard shortcut: Cmd+Enter to approve
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && code.trim()) {
        handleApprove();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleApprove, code]);

  const handleDeny = useCallback(() => {
    denyMutation.mutate(
      { loadId, moneyCodeId, dispatcherNote: note || undefined },
      { onSuccess: () => onComplete?.() },
    );
  }, [note, loadId, moneyCodeId, denyMutation, onComplete]);

  return (
    <div className="space-y-3">
      {/* Code input */}
      <div>
        <Label htmlFor="money-code" className="text-xs text-muted-foreground">
          Money Code
        </Label>
        <Input
          id="money-code"
          placeholder="Enter code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 font-mono"
          autoFocus
        />
      </div>

      {/* Amount */}
      <div>
        <Label htmlFor="approve-amount" className="text-xs text-muted-foreground">
          Approved Amount (requested: ${(requestedCents / 100).toFixed(2)})
        </Label>
        <Input
          id="approve-amount"
          type="number"
          inputMode="decimal"
          value={amountCents ? (amountCents / 100).toString() : ''}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setAmountCents(isNaN(val) ? 0 : Math.round(val * 100));
          }}
          className="mt-1"
        />
      </div>

      {/* Note */}
      <div>
        <Label htmlFor="dispatcher-note" className="text-xs text-muted-foreground">
          Note (optional)
        </Label>
        <Textarea
          id="dispatcher-note"
          placeholder="Note to driver..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 resize-none"
          rows={2}
        />
      </div>

      {/* Method badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Method: <span className="uppercase font-medium text-foreground">{method}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" loading={denyMutation.isPending} onClick={handleDeny}>
          Deny
        </Button>
        <Button
          className="flex-1"
          disabled={!code.trim() || amountCents < 100}
          loading={approveMutation.isPending}
          onClick={handleApprove}
        >
          Approve &amp; Send
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground text-center">⌘+Enter to approve</p>
    </div>
  );
}
