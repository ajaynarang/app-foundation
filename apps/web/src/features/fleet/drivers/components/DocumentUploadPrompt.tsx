'use client';

import { useRef } from 'react';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { useDocumentUpload } from '../hooks/use-document-upload';
import { getDocumentTypeLabel } from '@/features/fleet/documents/types';

interface DocumentUploadPromptProps {
  stopId: number;
  actionType: 'pickup' | 'delivery' | 'both' | 'exchange';
  onSkip?: () => void;
  onUploadComplete?: () => void;
}

export function DocumentUploadPrompt({ stopId, actionType, onSkip, onUploadComplete }: DocumentUploadPromptProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useDocumentUpload();

  const docType = actionType === 'delivery' ? 'pod' : 'bol';
  const docLabel = getDocumentTypeLabel(docType);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await upload({
        file,
        entityType: 'load_stop',
        entityId: stopId,
        documentType: docType,
      });
      onUploadComplete?.();
    } catch {
      // Error already shown via toast in hook
    }

    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h4 className="text-sm font-semibold text-foreground text-center">Upload {docLabel}?</h4>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => cameraRef.current?.click()} loading={isUploading}>
            <Camera className="mr-1.5 h-4 w-4" />
            Camera
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => galleryRef.current?.click()}
            loading={isUploading}
          >
            <ImageIcon className="mr-1.5 h-4 w-4" />
            Gallery
          </Button>
        </div>

        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onSkip} disabled={isUploading}>
          Skip for now
        </Button>

        {/* Hidden file inputs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </CardContent>
    </Card>
  );
}
