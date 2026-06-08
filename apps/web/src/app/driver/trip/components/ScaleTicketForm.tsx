'use client';

import { useState, useCallback, useRef } from 'react';
import { Scale, Camera, Image as ImageIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { useDocumentUpload } from '@/features/fleet/drivers/hooks/use-document-upload';
import { useCreateDriverAction } from '@/features/fleet/loads/hooks/use-driver-actions';

interface ScaleTicketFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadDbId: number;
}

export function ScaleTicketForm({ open, onOpenChange, loadId, loadDbId }: ScaleTicketFormProps) {
  const [weight, setWeight] = useState('');
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
          documentType: 'scale_ticket',
        });
        if (!docId) return; // Validation failure — toast shown by upload()
        documentId = docId;
      } catch {
        return; // Upload error — toast shown by upload()
      }
    }

    createAction.mutate(
      {
        loadId,
        actionType: 'scale_ticket',
        metadata: {
          weightLbs: parseFloat(weight) || undefined,
          ...(documentId ? { documentId } : {}),
        },
      },
      {
        onSuccess: () => {
          setWeight('');
          setPhotoPreview(null);
          setPhotoFile(null);
          onOpenChange(false);
        },
      },
    );
  }, [weight, photoFile, loadId, loadDbId, upload, createAction, onOpenChange]);

  const isSubmitting = isUploading || createAction.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-400/10 flex items-center justify-center">
              <Scale className="h-4 w-4 text-blue-400" />
            </div>
            Scale Ticket
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Photo */}
          {photoPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Scale ticket"
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

          {/* Weight */}
          <div>
            <Label htmlFor="weight" className="text-xs text-muted-foreground">
              Weight (lbs)
            </Label>
            <Input
              id="weight"
              type="number"
              inputMode="numeric"
              placeholder="e.g. 42000"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1"
            />
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
