'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { BillingReadinessItem } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingItems: BillingReadinessItem[];
  onConfirm: (reason: string) => void;
  isPending: boolean;
}

export function OverrideDialog({ open, onOpenChange, missingItems, onConfirm, isPending }: Props) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim().length >= 10) {
      onConfirm(reason.trim());
      setReason('');
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason('');
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <AlertTriangle className={`h-5 w-5 ${SEMANTIC_COLORS.caution.text}`} />
            Override Billing Requirements
          </DialogTitle>
          <DialogDescription>
            {missingItems.length} required {missingItems.length === 1 ? 'item is' : 'items are'} missing:
          </DialogDescription>
        </DialogHeader>

        <ul className="text-sm text-foreground space-y-1 ml-4">
          {missingItems.map((item, i) => (
            <li key={i} className="list-disc">
              {item.label}
              {item.relatedStopName && ` (${item.relatedStopName})`}
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <Label htmlFor="override-reason">Reason for override *</Label>
          <Textarea
            id="override-reason"
            placeholder="Explain why this load should be approved without the missing items..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
          />
          {reason.length > 0 && reason.length < 10 && (
            <p className="text-xs text-muted-foreground">At least 10 characters required ({10 - reason.length} more)</p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded-md">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          This override will be logged for audit.
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={isPending} disabled={reason.trim().length < 10}>
            Override & Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
