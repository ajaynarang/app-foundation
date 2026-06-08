'use client';

import { useState, useMemo } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { CheckCircle, DollarSign, Download, Ban, X } from 'lucide-react';
import { useBatchApprove, useBatchPay, useBatchVoid } from '../hooks/use-settlements';
import { settlementsApi } from '../api';
import type { Settlement } from '../types';

interface BatchActionBarProps {
  selectedIds: string[];
  settlements: Settlement[];
  onClearSelection: () => void;
}

export function BatchActionBar({ selectedIds, settlements, onClearSelection }: BatchActionBarProps) {
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);

  const batchApprove = useBatchApprove();
  const batchPay = useBatchPay();
  const batchVoid = useBatchVoid();

  // Count eligible settlements per action (must be before early return)
  const { approveCount, payCount, voidCount } = useMemo(() => {
    const selected = settlements.filter((s) => selectedIds.includes(s.settlementId));
    return {
      approveCount: selected.filter((s) => s.status === 'DRAFT').length,
      payCount: selected.filter((s) => s.status === 'APPROVED').length,
      voidCount: selected.filter((s) => s.status !== 'VOID' && s.status !== 'PAID').length,
    };
  }, [selectedIds, settlements]);

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleApprove = () => {
    const ids = settlements
      .filter((s) => selectedIds.includes(s.settlementId) && s.status === 'DRAFT')
      .map((s) => s.settlementId);
    if (ids.length === 0) return;
    batchApprove.mutate(ids, { onSuccess: () => onClearSelection() });
  };

  const handlePay = () => {
    const ids = settlements
      .filter((s) => selectedIds.includes(s.settlementId) && s.status === 'APPROVED')
      .map((s) => s.settlementId);
    if (ids.length === 0) return;
    batchPay.mutate(ids, { onSuccess: () => onClearSelection() });
  };

  const handleDownload = async () => {
    try {
      await settlementsApi.batchDownloadPdf(selectedIds);
    } catch {
      // Error handled by API layer
    }
  };

  const handleVoid = () => {
    const ids = settlements
      .filter((s) => selectedIds.includes(s.settlementId) && s.status !== 'VOID' && s.status !== 'PAID')
      .map((s) => s.settlementId);
    if (ids.length === 0) return;
    batchVoid.mutate(ids, {
      onSuccess: () => {
        onClearSelection();
        setVoidConfirmOpen(false);
      },
    });
  };

  const anyPending = batchApprove.isPending || batchPay.isPending || batchVoid.isPending;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 shadow-lg backdrop-blur-sm">
        <span className="text-sm font-medium text-foreground mr-2 whitespace-nowrap">{count} selected</span>

        {approveCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleApprove}
            loading={batchApprove.isPending}
            disabled={anyPending && !batchApprove.isPending}
          >
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            Approve {approveCount}
          </Button>
        )}

        {payCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handlePay}
            loading={batchPay.isPending}
            disabled={anyPending && !batchPay.isPending}
          >
            <DollarSign className="mr-1.5 h-3.5 w-3.5" />
            Mark {payCount} Paid
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={handleDownload} disabled={anyPending}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download All
        </Button>

        {voidCount > 0 && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setVoidConfirmOpen(true)}
            loading={batchVoid.isPending}
            disabled={anyPending && !batchVoid.isPending}
          >
            <Ban className="mr-1.5 h-3.5 w-3.5" />
            Void {voidCount}
          </Button>
        )}

        <Button size="icon" variant="ghost" onClick={onClearSelection} className="ml-1 h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <AlertDialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Void {voidCount} Settlement{voidCount !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void {voidCount} selected settlement
              {voidCount !== 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleVoid} loading={batchVoid.isPending}>
              Void {voidCount} Settlement{voidCount !== 1 ? 's' : ''}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
