'use client';

import { useRef, useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Camera, ImagePlus, RotateCcw } from 'lucide-react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useScanReceipt } from '../hooks/use-fuel-log';
import type { FuelReceiptExtraction } from '@sally/shared-types';

interface ReceiptScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtracted: (data: FuelReceiptExtraction) => void;
}

const MIN_FIELDS_FOR_SUCCESS = 3;

export function ReceiptScanner({ open, onOpenChange, onExtracted }: ReceiptScannerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lowQuality, setLowQuality] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const { mutate: scan, isPending } = useScanReceipt();

  function reset() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setLowQuality(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setLowQuality(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(selected));
  }

  function handleExtract() {
    if (!file) return;

    scan(file, {
      onSuccess: (response) => {
        if (response.fieldsExtracted < MIN_FIELDS_FOR_SUCCESS) {
          setLowQuality(true);
          return;
        }
        onExtracted(response.extracted);
        handleOpenChange(false);
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="flex flex-col rounded-t-2xl max-h-[90dvh] pb-safe">
        <SheetHeader className="flex-shrink-0 pb-2">
          <SheetTitle>Scan Fuel Receipt</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2 px-1 pb-2">
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Capture fuel receipt image"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Select fuel receipt from gallery"
          />

          {!preview ? (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full h-24 flex flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-6 w-6" />
                <span>Take Photo of Receipt</span>
              </Button>

              <Button variant="ghost" className="w-full h-11" onClick={() => galleryInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4 mr-2" />
                Choose from Gallery
              </Button>
            </div>
          ) : isPending ? (
            <div className="space-y-3">
              <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Receipt preview" className="w-full h-full object-contain opacity-40" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">Reading receipt...</p>
                <Skeleton className="h-4 w-3/4 mx-auto" />
                <Skeleton className="h-4 w-1/2 mx-auto" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="aspect-[3/4] bg-muted rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Receipt preview" className="w-full h-full object-contain" />
              </div>

              {lowQuality && (
                <p className="text-sm text-caution text-center">
                  Couldn&apos;t read the receipt clearly. Try retaking with better lighting or enter manually.
                </p>
              )}

              <Button variant="ghost" size="sm" onClick={reset} className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 pt-4 border-t border-border space-y-2">
          {preview && !isPending && (
            <Button className="w-full h-12 text-base font-semibold" onClick={handleExtract}>
              Extract Receipt Data
            </Button>
          )}
          <Button variant="ghost" className="w-full h-11" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
