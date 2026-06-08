'use client';

import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { REVERSAL_CATEGORY_LABELS } from '@sally/shared-types';
import type { ReversalCategory } from '../types';
import { useRevertPreview, useRevertLoad } from '../hooks/use-loads';

const REVERSAL_TARGET_MAP: Record<string, string> = {
  IN_TRANSIT: 'ASSIGNED',
  DELIVERED: 'IN_TRANSIT',
  CANCELLED: 'PENDING',
  TONU: 'PENDING',
};

interface RevertLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadNumber: string;
  currentStatus: string;
}

export function RevertLoadDialog({ open, onOpenChange, loadId, loadNumber, currentStatus }: RevertLoadDialogProps) {
  const targetStatus = REVERSAL_TARGET_MAP[currentStatus];
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');

  const { data: preview, isLoading: previewLoading } = useRevertPreview(
    open ? loadId : null,
    open ? targetStatus : null,
  );
  const revertMutation = useRevertLoad();

  useEffect(() => {
    if (open) {
      setCategory('');
      setReason('');
    }
  }, [open]);

  const canSubmit = category && reason.trim().length >= 5 && !preview?.blocked && !previewLoading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    revertMutation.mutate(
      {
        loadId,
        data: { targetStatus, category: category as ReversalCategory, reason: reason.trim() },
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  if (!targetStatus) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Revert Load #{loadNumber}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Reverting from{' '}
            <Badge variant="outline" className="mx-1 capitalize">
              {currentStatus.replace(/_/g, ' ').toLowerCase()}
            </Badge>
            to{' '}
            <Badge variant="outline" className="mx-1 capitalize">
              {targetStatus.replace(/_/g, ' ').toLowerCase()}
            </Badge>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {previewLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : preview ? (
            <div className="space-y-2">
              {preview.blocked && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{preview.blockReason}</div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  {preview.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}

              {!preview.blocked && (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">This will:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {preview.affectedStops.length > 0 && (
                      <li>
                        Reset {preview.affectedStops.length} stop
                        {preview.affectedStops.length > 1 ? 's' : ''} to pending
                      </li>
                    )}
                    {preview.affectedInvoices.map((inv) => (
                      <li key={inv.id}>
                        Void Invoice {inv.invoiceNumber} ($
                        {(inv.totalCents / 100).toFixed(2)})
                      </li>
                    ))}
                    {preview.affectedSettlementLines.map((sl) => (
                      <li key={sl.id}>
                        Remove settlement line from {sl.settlementNumber} ($
                        {(sl.payAmountCents / 100).toFixed(2)})
                      </li>
                    ))}
                    {(currentStatus === 'CANCELLED' || currentStatus === 'TONU') && (
                      <li>Clear driver and vehicle assignment</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Reason Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REVERSAL_CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              placeholder="Explain why this reversal is needed (min 5 characters)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={handleSubmit} loading={revertMutation.isPending} disabled={!canSubmit}>
            Confirm Reversal
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
