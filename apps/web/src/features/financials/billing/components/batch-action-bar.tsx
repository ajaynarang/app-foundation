'use client';

import { useState } from 'react';
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
import { Send, Download, DollarSign, Ban, X, Building2 } from 'lucide-react';
import { useBatchSendInvoices, useBatchVoidInvoices, useBatchMarkPaid } from '../hooks/use-invoices';
import { invoicesApi } from '../api';
import { SubmitToFactorDialog } from './submit-to-factor-dialog';

interface BatchActionBarProps {
  selectedIds: string[];
  onClearSelection: () => void;
}

export function BatchActionBar({ selectedIds, onClearSelection }: BatchActionBarProps) {
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [submitFactorOpen, setSubmitFactorOpen] = useState(false);

  const batchSend = useBatchSendInvoices();
  const batchVoid = useBatchVoidInvoices();
  const batchMarkPaid = useBatchMarkPaid();

  const count = selectedIds.length;
  if (count === 0) return null;

  const handleSendAll = () => {
    batchSend.mutate({ invoiceIds: selectedIds }, { onSuccess: () => onClearSelection() });
  };

  const handleDownloadAll = async () => {
    try {
      const blob = await invoicesApi.batchDownload(selectedIds);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Error toast handled by api layer
    }
  };

  const handleMarkPaid = () => {
    batchMarkPaid.mutate(
      {
        invoiceIds: selectedIds,
        data: { paymentDate: new Date().toISOString().split('T')[0] },
      },
      { onSuccess: () => onClearSelection() },
    );
  };

  const handleVoidAll = () => {
    batchVoid.mutate(selectedIds, {
      onSuccess: () => {
        onClearSelection();
        setVoidConfirmOpen(false);
      },
    });
  };

  const anyPending = batchSend.isPending || batchVoid.isPending || batchMarkPaid.isPending;

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 shadow-lg backdrop-blur-sm">
        <span className="text-sm font-medium text-foreground mr-2 whitespace-nowrap">{count} selected</span>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSendAll}
          loading={batchSend.isPending}
          disabled={anyPending && !batchSend.isPending}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Send All
        </Button>

        <Button size="sm" variant="outline" onClick={handleDownloadAll} disabled={anyPending}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download All
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={handleMarkPaid}
          loading={batchMarkPaid.isPending}
          disabled={anyPending && !batchMarkPaid.isPending}
        >
          <DollarSign className="mr-1.5 h-3.5 w-3.5" />
          Mark Paid
        </Button>

        <Button size="sm" variant="outline" onClick={() => setSubmitFactorOpen(true)} disabled={anyPending}>
          <Building2 className="mr-1.5 h-3.5 w-3.5" />
          Submit to Factor
        </Button>

        <Button
          size="sm"
          variant="destructive"
          onClick={() => setVoidConfirmOpen(true)}
          loading={batchVoid.isPending}
          disabled={anyPending && !batchVoid.isPending}
        >
          <Ban className="mr-1.5 h-3.5 w-3.5" />
          Void All
        </Button>

        <Button size="icon" variant="ghost" onClick={onClearSelection} className="ml-1 h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Void Confirmation */}
      <AlertDialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {count} Invoices?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void {count} selected invoice
              {count > 1 ? 's' : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleVoidAll} loading={batchVoid.isPending}>
              Void All
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Submit to Factor Dialog */}
      <SubmitToFactorDialog
        mode="batch"
        invoiceIds={selectedIds}
        open={submitFactorOpen}
        onOpenChange={setSubmitFactorOpen}
        onSuccess={onClearSelection}
      />
    </>
  );
}
