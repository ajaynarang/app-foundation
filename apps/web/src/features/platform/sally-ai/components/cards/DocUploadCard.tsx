'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { showSuccess, showError } from '@sally/ui';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { documentsApi } from '@/features/fleet/documents/api';
import type { DocUploadCardData } from '../../engine/types';

type UploadState = 'idle' | 'uploading' | 'confirming' | 'success' | 'error';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/heic'];

const ALLOWED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.heic';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocUploadCard({ data }: { data: Record<string, unknown> }) {
  const card = data as unknown as DocUploadCardData;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Abort XHR on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `Unsupported file type. Allowed: PDF, PNG, JPG, TIFF, HEIC`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (${formatFileSize(file.size)}). Maximum: 10 MB`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        setState('error');
        return;
      }

      setSelectedFile(file);
      setErrorMessage(null);
      setState('uploading');
      setProgress(0);

      try {
        // Step 1: Get presigned URL from existing REST endpoint
        setProgress(10);
        const presignResult = await documentsApi.presignUpload({
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          entityType: card.entityType,
          entityId: String(card.entityId),
          documentType: card.documentType,
        });

        // Step 2: Upload directly to S3
        setProgress(30);
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              // Map upload progress to 30-80% range
              const uploadPct = 30 + Math.round((e.loaded / e.total) * 50);
              setProgress(uploadPct);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`S3 upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => reject(new Error('Upload failed — network error')));
          xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

          xhr.open('PUT', presignResult.uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });

        // Step 3: Confirm upload via existing REST endpoint
        setProgress(85);
        setState('confirming');
        await documentsApi.confirmUpload(presignResult.documentId);

        setProgress(100);
        setState('success');
        showSuccess(`${card.documentTypeLabel} uploaded for load ${card.loadNumber}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed. Please try again.';
        setErrorMessage(msg);
        setState('error');
        showError('Upload failed', msg);
      }
    },
    [card, validateFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRetry = useCallback(() => {
    setState('idle');
    setSelectedFile(null);
    setErrorMessage(null);
    setProgress(0);
  }, []);

  // Success state
  if (state === 'success') {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${SEMANTIC_COLORS.neutral.text}`} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {card.documentTypeLabel} uploaded for {card.loadNumber}
            </p>
            {selectedFile && (
              <p className="text-xs text-muted-foreground">
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className={`h-4 w-4 flex-shrink-0 ${SEMANTIC_COLORS.critical.text}`} />
          <p className={`text-sm font-medium ${SEMANTIC_COLORS.critical.text}`}>Upload failed</p>
        </div>
        {errorMessage && <p className="text-xs text-muted-foreground">{errorMessage}</p>}
        <Button variant="outline" size="sm" onClick={handleRetry}>
          Try again
        </Button>
      </div>
    );
  }

  // Uploading / confirming state
  if (state === 'uploading' || state === 'confirming') {
    return (
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {state === 'confirming' ? 'Confirming upload...' : `Uploading ${card.documentTypeLabel}...`}
            </p>
            {selectedFile && (
              <p className="text-xs text-muted-foreground">
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </p>
            )}
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground/60 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Idle — file picker drop zone
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Upload {card.documentTypeLabel} for {card.loadNumber}
        </p>
        {card.existingCount > 0 && (
          <span className="text-2xs text-muted-foreground">{card.existingCount} existing</span>
        )}
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Upload ${card.documentTypeLabel} for ${card.loadNumber}`}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed p-4 cursor-pointer transition-colors ${
          isDragOver
            ? 'border-foreground/50 bg-muted/60 dark:bg-muted/30'
            : 'border-border hover:border-foreground/30 hover:bg-muted/50 dark:hover:bg-muted/20'
        }`}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground text-center">
          {isDragOver ? 'Drop to upload' : 'Drop file here or click to browse'}
        </p>
        <p className="text-2xs text-muted-foreground/70">PDF, PNG, JPG, TIFF, HEIC — Max 10 MB</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS}
        onChange={handleInputChange}
        className="hidden"
        aria-label="Upload document file"
      />
    </div>
  );
}
