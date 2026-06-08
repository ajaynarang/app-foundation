'use client';

import { useState, useCallback, useRef } from 'react';
import { Fuel, Camera, Image as ImageIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { useDocumentUpload } from '@/features/fleet/drivers/hooks/use-document-upload';
import { useCreateDriverAction } from '@/features/fleet/loads/hooks/use-driver-actions';

interface FuelReceiptFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadDbId: number;
}

export function FuelReceiptForm({ open, onOpenChange, loadId, loadDbId }: FuelReceiptFormProps) {
  const [amount, setAmount] = useState('');
  const [gallons, setGallons] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useDocumentUpload();
  const createAction = useCreateDriverAction();

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
    let documentId: number | undefined;

    // Upload photo if captured
    if (photoFile) {
      try {
        const docId = await upload({
          file: photoFile,
          entityType: 'load',
          entityId: loadDbId,
          documentType: 'photo',
        });
        if (!docId) return;
        documentId = docId;
      } catch {
        return;
      }
    }

    createAction.mutate(
      {
        loadId,
        actionType: 'fuel_receipt',
        metadata: {
          amountCents: Math.round((parseFloat(amount) || 0) * 100),
          gallons: parseFloat(gallons) || undefined,
          ...(documentId ? { documentId } : {}),
        },
      },
      {
        onSuccess: () => {
          setAmount('');
          setGallons('');
          setPhotoPreview(null);
          setPhotoFile(null);
          onOpenChange(false);
        },
      },
    );
  }, [amount, gallons, photoFile, loadId, loadDbId, upload, createAction, onOpenChange]);

  const isSubmitting = isUploading || createAction.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-300/10 flex items-center justify-center">
              <Fuel className="h-4 w-4 text-blue-300" />
            </div>
            Fuel Receipt
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Photo capture */}
          {photoPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Fuel receipt"
                className="w-full max-h-40 object-contain rounded-xl border border-border"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 h-7 text-xs"
                onClick={() => {
                  setPhotoPreview(null);
                  setPhotoFile(null);
                }}
              >
                Retake
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-card hover:bg-muted/50 transition-colors"
                onClick={() => {
                  fileInputRef.current?.setAttribute('capture', 'environment');
                  fileInputRef.current?.click();
                }}
              >
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Camera</span>
              </button>
              <button
                type="button"
                className="flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-card hover:bg-muted/50 transition-colors"
                onClick={() => {
                  fileInputRef.current?.removeAttribute('capture');
                  fileInputRef.current?.click();
                }}
              >
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Gallery</span>
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fuel-amount" className="text-xs text-muted-foreground">
                Amount ($)
              </Label>
              <Input
                id="fuel-amount"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="fuel-gallons" className="text-xs text-muted-foreground">
                Gallons
              </Label>
              <Input
                id="fuel-gallons"
                type="number"
                inputMode="decimal"
                placeholder="0.0"
                value={gallons}
                onChange={(e) => setGallons(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={isSubmitting} onClick={handleSubmit}>
              Submit
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
