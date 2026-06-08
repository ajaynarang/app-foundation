'use client';

import { useState, useCallback, useRef } from 'react';
import { Camera, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';

import { useDocumentUpload } from '@/features/fleet/drivers/hooks/use-document-upload';
import { useMarkMoneyCodeUsed } from '@/features/fleet/loads/hooks/use-money-codes';

interface ReceiptUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  /** Numeric DB ID for the load (used for document upload entity) */
  loadDbId: number;
  stopId?: number | null;
  moneyCodeId: string;
  prefilledAmountCents: number;
}

export function ReceiptUpload({
  open,
  onOpenChange,
  loadId,
  loadDbId,
  stopId,
  moneyCodeId,
  prefilledAmountCents,
}: ReceiptUploadProps) {
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [amountCents, setAmountCents] = useState(prefilledAmountCents);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useDocumentUpload();
  const markUsedMutation = useMarkMoneyCodeUsed();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const handleSubmit = useCallback(async () => {
    if (amountCents < 100) return;

    let receiptDocumentId: number | undefined;

    // Upload receipt photo if captured
    if (photoFile) {
      try {
        const docId = await upload({
          file: photoFile,
          entityType: 'load',
          entityId: loadDbId,
          documentType: 'lumper_receipt',
          ...(stopId ? { relatedStopId: stopId } : {}),
        });
        if (!docId) return; // Validation failure — toast already shown by upload()
        receiptDocumentId = docId;
      } catch {
        // Upload error toast already shown by useDocumentUpload
        return;
      }
    }

    // Mark money code as used with receipt
    markUsedMutation.mutate(
      { loadId, moneyCodeId, actualAmountCents: amountCents, receiptDocumentId },
      {
        onSuccess: () => {
          setPhotoPreview(null);
          setPhotoFile(null);
          onOpenChange(false);
        },
      },
    );
  }, [amountCents, photoFile, loadId, loadDbId, stopId, moneyCodeId, upload, markUsedMutation, onOpenChange]);

  const isSubmitting = isUploading || markUsedMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left">Upload Receipt</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Photo preview or capture */}
          {photoPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Receipt"
                className="w-full max-h-48 object-contain rounded-xl border border-border"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 h-8"
                onClick={() => {
                  setPhotoPreview(null);
                  setPhotoFile(null);
                  fileInputRef.current?.click();
                }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retake
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 flex flex-col items-center gap-2 p-6 rounded-xl border border-dashed border-border bg-card hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute('capture', 'environment');
                    fileInputRef.current.click();
                  }
                }}
              >
                <Camera className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Camera</span>
              </button>
              <button
                type="button"
                className="flex-1 flex flex-col items-center gap-2 p-6 rounded-xl border border-dashed border-border bg-card hover:bg-muted/50 transition-colors"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                  }
                }}
              >
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Gallery</span>
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* Amount confirmation */}
          <div>
            <Label htmlFor="receipt-amount" className="text-xs text-muted-foreground">
              Receipt Amount
            </Label>
            <Input
              id="receipt-amount"
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

          {/* Submit */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={amountCents < 100} loading={isSubmitting} onClick={handleSubmit}>
              Submit Receipt
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
