'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Label } from '@sally/ui/components/ui/label';
import { Loader2, Send, Mail, Paperclip, Eye } from 'lucide-react';
import { showError } from '@sally/ui';
import { useEmailPreview } from '../hooks/use-invoices';
import { invoicesApi } from '../api';
import { PdfPreviewDialog } from '@/features/fleet/documents/components/viewer';

interface SendInvoiceDialogProps {
  invoiceId: string;
  mode: 'send' | 'resend';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function SendInvoiceDialog({
  invoiceId,
  mode,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: SendInvoiceDialogProps) {
  const { data: preview, isLoading } = useEmailPreview(invoiceId, open);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const handlePreviewPdf = async () => {
    try {
      const blobUrl = await invoicesApi.getPreviewBlobUrl(invoiceId);
      setPdfPreviewUrl(blobUrl);
      setPdfPreviewOpen(true);
    } catch {
      showError('Failed to load PDF preview');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === 'send' ? 'Send Invoice' : 'Resend Invoice'}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Recipient */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To</Label>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {preview.to || <span className="text-destructive">No email configured for this customer</span>}
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subject</Label>
                <p className="text-sm font-medium text-foreground">{preview.subject}</p>
              </div>

              <Separator />

              {/* Body preview */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Body</Label>
                <div
                  className="rounded-md border border-border bg-card p-3 text-sm max-h-64 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: preview.bodyHtml }}
                />
              </div>

              {/* Attachment indicator */}
              {preview.hasPdfAttachment && (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Paperclip className="h-4 w-4" />
                    <span>{preview.invoiceNumber}.pdf</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handlePreviewPdf}>
                    <Eye className="mr-1 h-3 w-3" />
                    Preview PDF
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Failed to load email preview.</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={!preview?.to} loading={isPending}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {mode === 'send' ? 'Send Invoice' : 'Resend Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onOpenChange={(next) => {
          setPdfPreviewOpen(next);
          if (!next && pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
          }
        }}
        pdfUrl={pdfPreviewUrl}
        title={`Invoice ${invoiceId}`}
        onDownload={() => invoicesApi.downloadPdf(invoiceId)}
      />
    </>
  );
}
