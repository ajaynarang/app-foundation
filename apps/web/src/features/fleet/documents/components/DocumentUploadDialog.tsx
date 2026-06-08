'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { UploadCloud, FileText, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { showSuccess, showError } from '@sally/ui';
import { usePresignUpload, useConfirmUpload } from '../hooks/use-documents';
import { getDocumentTypesForEntity } from '../types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

type UploadPhase = 'idle' | 'uploading' | 'confirming' | 'done';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: number;
  preselectedType?: string;
  preselectedStopId?: number;
  documentTypes?: Array<{ value: string; label: string }>;
}

export function DocumentUploadDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  preselectedType,
  preselectedStopId,
  documentTypes,
}: DocumentUploadDialogProps) {
  const presignUpload = usePresignUpload();
  const confirmUpload = useConfirmUpload();
  const typeOptions = documentTypes ?? getDocumentTypesForEntity('load');

  const [documentType, setDocumentType] = useState<string>(preselectedType ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preselected type when it changes or dialog opens
  useEffect(() => {
    if (open) {
      setDocumentType(preselectedType ?? '');
      setSelectedFile(null);
      setValidationError(null);
      setPhase('idle');
    }
  }, [open, preselectedType]);

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large. Maximum size is 10 MB (this file is ${formatFileSize(file.size)}).`;
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/heic'];
    if (!allowed.includes(file.type)) {
      return `Unsupported file type "${file.type}". Accepted: PDF, JPEG, PNG, TIFF, HEIC.`;
    }
    return null;
  }, []);

  const applyFile = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        setValidationError(error);
        setSelectedFile(null);
      } else {
        setValidationError(null);
        setSelectedFile(file);
      }
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) applyFile(file);
    },
    [applyFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) applyFile(file);
      // Reset so same file can be re-selected if cleared
      e.target.value = '';
    },
    [applyFile],
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
  }, []);

  const isSubmitting = phase === 'uploading' || phase === 'confirming';
  const canSubmit = !!selectedFile && !!documentType && !isSubmitting && phase !== 'done';

  const handleSubmit = async () => {
    if (!selectedFile || !documentType) return;

    setValidationError(null);

    try {
      // Phase 1: Presign
      setPhase('uploading');
      const presignResult = await presignUpload.mutateAsync({
        fileName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        fileSize: selectedFile.size,
        entityType: entityType,
        entityId: String(entityId),
        documentType: documentType,
        ...(preselectedStopId !== undefined ? { relatedStopId: String(preselectedStopId) } : {}),
      });

      // Phase 2: Direct S3 upload via PUT
      const uploadResponse = await fetch(presignResult.uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type || 'application/octet-stream',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed with status ${uploadResponse.status}`);
      }

      // Phase 3: Confirm
      setPhase('confirming');
      await confirmUpload.mutateAsync(presignResult.documentId);

      setPhase('done');
      showSuccess('Document uploaded');

      // Close after a brief moment so user sees the success state
      setTimeout(() => {
        onOpenChange(false);
      }, 800);
    } catch (err) {
      setPhase('idle');
      const message = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      setValidationError(message);
      showError('Upload failed', message);
    }
  };

  function phaseLabel(): string {
    switch (phase) {
      case 'uploading':
        return 'Uploading…';
      case 'confirming':
        return 'Confirming…';
      case 'done':
        return 'Done!';
      default:
        return 'Upload';
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[min(28rem,calc(100vw-2rem))] bg-background border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Upload Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2 min-w-0">
          {/* Document type selector */}
          <div className="space-y-1.5">
            <Label htmlFor="doc-type" className="text-sm text-foreground">
              Document type <span className="text-critical">*</span>
            </Label>
            <Select value={documentType} onValueChange={setDocumentType} disabled={isSubmitting}>
              <SelectTrigger id="doc-type" className="w-full border-input bg-background text-foreground">
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent className="bg-background border-border">
                {typeOptions.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-foreground">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File drop zone */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">
              File <span className="text-critical">*</span>
            </Label>

            {selectedFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 overflow-hidden">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-foreground truncate max-w-full">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
                {!isSubmitting && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={clearFile}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove file</span>
                  </Button>
                )}
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !isSubmitting && fileInputRef.current?.click()}
                className={[
                  'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 px-4 cursor-pointer transition-colors',
                  isDragOver
                    ? 'border-foreground bg-accent/50'
                    : 'border-border hover:border-foreground/40 hover:bg-accent/30',
                  isSubmitting ? 'pointer-events-none opacity-50' : '',
                ].join(' ')}
              >
                <UploadCloud
                  className={['h-7 w-7', isDragOver ? 'text-foreground' : 'text-muted-foreground'].join(' ')}
                />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    {isDragOver ? 'Drop file here' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, PNG, WEBP — max 10 MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,application/pdf,image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Validation / error alert */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Phase progress indicators */}
          {phase !== 'idle' && (
            <div className="space-y-1">
              {(['uploading', 'confirming', 'done'] as UploadPhase[]).map((p, i) => {
                const phaseIndex = ['uploading', 'confirming', 'done'].indexOf(phase);
                const stepIndex = i;
                const isDone = phaseIndex > stepIndex || phase === 'done';
                const isActive = phaseIndex === stepIndex && phase !== 'done';
                const labels = ['Uploading to storage…', 'Confirming document…', 'Upload complete'];
                return (
                  <div key={p} className="flex items-center gap-2">
                    <div
                      className={[
                        'h-1.5 w-1.5 rounded-full flex-shrink-0',
                        isDone ? 'bg-foreground' : isActive ? 'bg-foreground animate-pulse' : 'bg-muted-foreground/30',
                      ].join(' ')}
                    />
                    <p
                      className={[
                        'text-xs',
                        isDone
                          ? 'text-foreground'
                          : isActive
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground/50',
                      ].join(' ')}
                    >
                      {labels[i]}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-border text-foreground"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {phase === 'done' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {phaseLabel()}
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {phaseLabel()}
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                {phaseLabel()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
