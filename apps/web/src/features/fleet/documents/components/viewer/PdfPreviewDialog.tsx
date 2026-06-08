'use client';

import { useState, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay } from '@sally/ui/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@sally/ui/components/ui/button';
import dynamic from 'next/dynamic';
import { Skeleton } from '@sally/ui/components/ui/skeleton';

const PdfPreview = dynamic(() => import('./PdfPreview').then((m) => ({ default: m.PdfPreview })), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-4 p-4">
      <Skeleton className="h-[600px] w-[450px] rounded" />
    </div>
  ),
});

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blob URL or presigned URL for the PDF */
  pdfUrl: string | null;
  title: string;
  onDownload?: () => void;
}

/**
 * Lightweight PDF preview dialog for system-generated documents
 * (invoices, settlements). No sidebar, no compliance — just the PDF.
 */
export function PdfPreviewDialog({ open, onOpenChange, pdfUrl, title, onDownload }: PdfPreviewDialogProps) {
  const [scale, setScale] = useState(1);

  const canZoomIn = scale < ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  const canZoomOut = scale > ZOOM_LEVELS[0];

  const handleZoomIn = useCallback(() => {
    const next = ZOOM_LEVELS.find((z) => z > scale);
    if (next) setScale(next);
  }, [scale]);

  const handleZoomOut = useCallback(() => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < scale);
    if (prev) setScale(prev);
  }, [scale]);

  const handleFit = useCallback(() => setScale(1), []);

  // Reset zoom when dialog opens/closes
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setScale(1);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-0 md:inset-4 z-50 flex flex-col bg-background border border-border md:rounded-lg shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
            <div className="flex items-center gap-1">
              {/* Zoom controls — hidden on mobile */}
              <div className="hidden sm:flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomOut}
                  disabled={!canZoomOut}
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomIn}
                  disabled={!canZoomIn}
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleFit} title="Fit to view">
                  <Maximize className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
              </div>

              {onDownload && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDownload} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}

              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* PDF content */}
          <div className="flex-1 overflow-auto bg-muted/30">
            {pdfUrl ? (
              <PdfPreview url={pdfUrl} scale={scale} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Skeleton className="h-[500px] w-[400px] rounded" />
              </div>
            )}
          </div>

          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">PDF preview for {title}</DialogPrimitive.Description>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
