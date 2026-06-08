'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, AlertCircle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';

interface StagedFile {
  file: File;
  id: string; // unique key for React
}

interface RateconUploadZoneProps {
  stagedFiles: StagedFile[];
  onFilesStaged: (files: StagedFile[]) => void;
  onRemoveFile: (id: string) => void;
  isUploading: boolean;
  error: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export type { StagedFile };

export function RateconUploadZone({
  stagedFiles,
  onFilesStaged,
  onRemoveFile,
  isUploading,
  error,
}: RateconUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndStage = useCallback(
    (files: FileList | File[]) => {
      setValidationError(null);
      const newFiles: StagedFile[] = [];
      const errors: string[] = [];

      const MAX_FILES = 3;

      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') {
          errors.push(`${file.name}: not a PDF`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          errors.push(`${file.name}: exceeds 10MB`);
          continue;
        }
        // Deduplicate by name+size against already staged files
        const isDuplicate = stagedFiles.some((sf) => sf.file.name === file.name && sf.file.size === file.size);
        if (isDuplicate) continue;

        if (stagedFiles.length + newFiles.length >= MAX_FILES) {
          errors.push(`Maximum ${MAX_FILES} files allowed`);
          break;
        }

        newFiles.push({
          file,
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        });
      }

      if (errors.length > 0) {
        setValidationError(errors.join(', '));
      }
      if (newFiles.length > 0) {
        onFilesStaged([...stagedFiles, ...newFiles]);
      }
    },
    [onFilesStaged, stagedFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        validateAndStage(e.dataTransfer.files);
      }
    },
    [validateAndStage],
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
      if (e.target.files && e.target.files.length > 0) {
        validateAndStage(e.target.files);
      }
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [validateAndStage],
  );

  const hasFiles = stagedFiles.length > 0;

  return (
    <div className="space-y-3 min-w-0">
      {(error || validationError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError || error}</AlertDescription>
        </Alert>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center rounded-lg cursor-pointer
          border-2 border-dashed transition-colors
          ${hasFiles ? 'py-4 px-4' : 'py-10 px-4'}
          ${
            isDragOver
              ? 'border-foreground bg-accent/50'
              : 'border-border hover:border-foreground/50 hover:bg-accent/30'
          }
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <div className="flex flex-col items-center space-y-1">
          {isDragOver ? (
            <FileText className={`text-foreground ${hasFiles ? 'h-5 w-5' : 'h-8 w-8'}`} />
          ) : (
            <Upload className={`text-muted-foreground ${hasFiles ? 'h-5 w-5' : 'h-8 w-8'}`} />
          )}
          <div className="text-center">
            <p className={`font-medium text-foreground ${hasFiles ? 'text-xs' : 'text-sm'}`}>
              {isDragOver
                ? 'Drop your rate confirmations'
                : hasFiles
                  ? 'Drop more PDFs or click to browse'
                  : 'Drop PDFs here or click to browse'}
            </p>
            {!hasFiles && <p className="text-xs text-muted-foreground mt-1">Up to 3 files, 10MB each</p>}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Staged file list */}
      {hasFiles && (
        <div className="space-y-1.5">
          {stagedFiles.map((sf) => (
            <div
              key={sf.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-card min-w-0"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted shrink-0">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-foreground truncate flex-1 min-w-0">{sf.file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(sf.file.size)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFile(sf.id);
                }}
                disabled={isUploading}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
