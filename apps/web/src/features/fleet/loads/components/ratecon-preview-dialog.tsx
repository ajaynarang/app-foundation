'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Sparkles,
  Upload,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Dialog, DialogPortal, DialogOverlay } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Switch } from '@sally/ui/components/ui/switch';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Label } from '@sally/ui/components/ui/label';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showError } from '@/shared/lib/toast';
import { loadsApi } from '@/features/fleet/loads/api';

const PdfPreview = dynamic(
  () =>
    import('@/features/fleet/documents/components/viewer/PdfPreview').then((m) => ({
      default: m.PdfPreview,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center gap-4 p-4">
        <Skeleton className="h-[600px] w-[450px] rounded" />
      </div>
    ),
  },
);

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ── Types ──

interface StagedFile {
  id: string;
  file: File;
  pdfData: Uint8Array;
  status: 'ready' | 'uploading' | 'processing' | 'done' | 'failed';
  jobId?: number;
  loadNumber?: string;
  loadId?: string;
  errorMessage?: string;
}

type DialogPhase = 'select' | 'preview' | 'extracting' | 'done';

interface ExtractedJob {
  jobId: number;
  fileName: string;
}

interface RateconPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtracted: (jobs: ExtractedJob[]) => void;
  /** Result from SSE-driven ghost state */
  completedJobIds?: Set<number>;
  failedJobs?: Map<number, string>; // jobId → errorMessage
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ── Component ──

export function RateconPreviewDialog({
  open,
  onOpenChange,
  onExtracted,
  completedJobIds,
  failedJobs,
}: RateconPreviewDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>('select');
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [useVision, setUseVision] = useState(false);
  const [forceReimport, setForceReimport] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFile = files[activeIndex];

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('select');
      setFiles([]);
      setActiveIndex(0);
      setScale(1);
      setUseVision(false);
      setForceReimport(false);
      setIsDragOver(false);
    }
  }, [open]);

  // React to SSE completion/failure events via props
  useEffect(() => {
    if (!completedJobIds && !failedJobs) return;

    setFiles((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        if (f.jobId && completedJobIds?.has(f.jobId) && f.status !== 'done') {
          changed = true;
          return { ...f, status: 'done' as const };
        }
        if (f.jobId && failedJobs?.has(f.jobId) && f.status !== 'failed') {
          changed = true;
          return { ...f, status: 'failed' as const, errorMessage: failedJobs.get(f.jobId) };
        }
        return f;
      });
      return changed ? next : prev;
    });
  }, [completedJobIds, failedJobs]);

  // Check if all files are done
  const allDone =
    phase === 'extracting' && files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'failed');
  useEffect(() => {
    if (allDone) setPhase('done');
  }, [allDone]);

  // ── File selection ──

  const addFiles = useCallback(
    async (newFiles: FileList | File[]) => {
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of Array.from(newFiles)) {
        if (file.type !== 'application/pdf') {
          errors.push(`${file.name}: not a PDF`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: exceeds 10MB`);
          continue;
        }
        const isDup = files.some((f) => f.file.name === file.name && f.file.size === file.size);
        if (isDup) continue;

        if (files.length + validFiles.length >= MAX_FILES) {
          errors.push(`Maximum ${MAX_FILES} files allowed`);
          break;
        }

        validFiles.push(file);
      }

      if (errors.length > 0) {
        showError('File validation', errors.join('. '));
      }

      if (validFiles.length > 0) {
        // Read all files as ArrayBuffer for PDF preview
        const toAdd: StagedFile[] = await Promise.all(
          validFiles.map(async (file) => ({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            file,
            pdfData: new Uint8Array(await file.arrayBuffer()),
            status: 'ready' as const,
          })),
        );

        setFiles((prev) => [...prev, ...toAdd]);
        setActiveIndex(0);
        setPhase('preview');
      }
    },
    [files],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length === 0) {
        setPhase('select');
        setActiveIndex(0);
      } else {
        setActiveIndex((a) => Math.min(a, next.length - 1));
      }
      return next;
    });
  }, []);

  const addMoreFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Extract ──

  const handleExtract = useCallback(async () => {
    const toProcess = files.filter((f) => f.status === 'ready' || f.status === 'failed');
    if (toProcess.length === 0) return;

    setPhase('extracting');
    const strategy = useVision ? 'vision' : 'text-first';
    const extractedJobs: ExtractedJob[] = [];

    // Mark files being processed as uploading
    const toProcessIds = new Set(toProcess.map((f) => f.id));
    setFiles((prev) =>
      prev.map((f) => (toProcessIds.has(f.id) ? { ...f, status: 'uploading' as const, errorMessage: undefined } : f)),
    );

    const results = await Promise.allSettled(
      toProcess.map(async (sf) => {
        try {
          const response = await loadsApi.parseRatecon(sf.file, forceReimport, strategy);
          setFiles((prev) =>
            prev.map((f) => (f.id === sf.id ? { ...f, status: 'processing' as const, jobId: response.jobId } : f)),
          );
          return { ...response, originalFileName: sf.file.name };
        } catch (err) {
          const e = err as { status?: number; loadNumber?: string; message?: string };
          const msg =
            e.status === 409 ? `Already imported as Load #${e.loadNumber || 'unknown'}` : e.message || 'Upload failed';
          setFiles((prev) =>
            prev.map((f) => (f.id === sf.id ? { ...f, status: 'failed' as const, errorMessage: msg } : f)),
          );
          throw err;
        }
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
      jobId: number;
      status: string;
      fileName: string;
      originalFileName: string;
    }>[];

    fulfilled.forEach((r) => extractedJobs.push({ jobId: r.value.jobId, fileName: r.value.originalFileName }));

    if (extractedJobs.length > 0) {
      onExtracted(extractedJobs);
    }

    // If some/all failed, go back to preview so user can adjust options and retry
    if (fulfilled.length < toProcess.length) {
      setPhase('preview');
    }
  }, [files, useVision, forceReimport, onExtracted]);

  // ── Navigation ──

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < files.length - 1;

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || phase === 'select') return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canPrev) {
        setActiveIndex((i) => i - 1);
        setScale(1);
      }
      if (e.key === 'ArrowRight' && canNext) {
        setActiveIndex((i) => i + 1);
        setScale(1);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, phase, canPrev, canNext]);

  // Zoom
  const zoomIdx = ZOOM_LEVELS.indexOf(scale);
  const canZoomIn = zoomIdx < ZOOM_LEVELS.length - 1;
  const canZoomOut = zoomIdx > 0;

  const isExtracting = phase === 'extracting' || phase === 'done';
  const readyCount = files.filter((f) => f.status === 'ready').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const failedCount = files.filter((f) => f.status === 'failed').length;
  const processingCount = files.filter((f) => f.status === 'uploading' || f.status === 'processing').length;
  const retryableCount = files.filter((f) => f.status === 'ready' || f.status === 'failed').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed inset-0 md:inset-4 z-50 flex flex-col bg-background border border-border md:rounded-lg shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
          onInteractOutside={(e) => {
            if (isExtracting && processingCount > 0) e.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="sr-only">Import Rate Confirmations</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Preview and extract data from rate confirmation PDFs
          </DialogPrimitive.Description>

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-medium text-foreground">
              Import Rate Confirmation{files.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              {phase !== 'select' && (
                <div className="hidden sm:flex items-center gap-1">
                  {/* Navigation */}
                  {files.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!canPrev}
                        onClick={() => {
                          setActiveIndex((i) => i - 1);
                          setScale(1);
                        }}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">
                        {activeIndex + 1}/{files.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={!canNext}
                        onClick={() => {
                          setActiveIndex((i) => i + 1);
                          setScale(1);
                        }}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-1" />
                    </>
                  )}

                  {/* Zoom */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!canZoomOut}
                    onClick={() => canZoomOut && setScale(ZOOM_LEVELS[zoomIdx - 1])}
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
                    disabled={!canZoomIn}
                    onClick={() => canZoomIn && setScale(ZOOM_LEVELS[zoomIdx + 1])}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(1)}>
                    <Maximize className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-4 bg-border mx-1" />
                </div>
              )}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* ── Phase: File Selection (full-screen drop zone) ── */}
          {phase === 'select' && (
            <div
              className={`flex-1 flex flex-col items-center justify-center transition-colors ${
                isDragOver ? 'bg-accent/30' : 'bg-muted/20'
              }`}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragOver(false);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center space-y-4 cursor-pointer">
                <div
                  className={`w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center transition-colors ${
                    isDragOver ? 'border-foreground bg-accent/50' : 'border-border'
                  }`}
                >
                  {isDragOver ? (
                    <FileText className="h-8 w-8 text-foreground" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-foreground">
                    {isDragOver ? 'Drop your rate confirmations' : 'Drop rate confirmations here'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse — up to {MAX_FILES} PDFs, 10MB each
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Phase: Preview / Extracting / Done ── */}
          {phase !== 'select' && (
            <div className="flex flex-1 min-h-0">
              {/* Left: PDF Preview */}
              <div className="flex-1 overflow-auto bg-muted/30 p-4 relative">
                {activeFile && <PdfPreview data={activeFile.pdfData} scale={scale} />}

                {/* Mobile navigation arrows */}
                {files.length > 1 && (
                  <div className="sm:hidden absolute top-1/2 left-0 right-0 flex justify-between px-2 -translate-y-1/2 pointer-events-none">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-background/80 backdrop-blur pointer-events-auto"
                      disabled={!canPrev}
                      onClick={() => {
                        setActiveIndex((i) => i - 1);
                        setScale(1);
                      }}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-background/80 backdrop-blur pointer-events-auto"
                      disabled={!canNext}
                      onClick={() => {
                        setActiveIndex((i) => i + 1);
                        setScale(1);
                      }}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Right: File list + actions */}
              <div className="w-80 border-l border-border shrink-0 hidden md:flex flex-col">
                {/* File list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Files ({files.length})
                    </p>
                    {!isExtracting && files.length < MAX_FILES && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={addMoreFiles}>
                        Add more
                      </Button>
                    )}
                  </div>

                  {files.map((sf, idx) => (
                    <div
                      key={sf.id}
                      onClick={() => {
                        setActiveIndex(idx);
                        setScale(1);
                      }}
                      className={`
                        group flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                        ${
                          idx === activeIndex
                            ? 'bg-accent/50 border border-border'
                            : 'hover:bg-accent/20 border border-transparent'
                        }
                      `}
                    >
                      {/* Status icon */}
                      <div className="shrink-0">
                        {sf.status === 'ready' && (
                          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                        {(sf.status === 'uploading' || sf.status === 'processing') && (
                          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
                            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                          </div>
                        )}
                        {sf.status === 'done' && (
                          <div className="w-7 h-7 rounded-md bg-accent/30 flex items-center justify-center">
                            <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
                          </div>
                        )}
                        {sf.status === 'failed' && (
                          <div className="w-7 h-7 rounded-md bg-destructive/10 flex items-center justify-center">
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          </div>
                        )}
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{sf.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sf.status === 'ready' && formatFileSize(sf.file.size)}
                          {sf.status === 'uploading' && 'Uploading...'}
                          {sf.status === 'processing' && 'Processing...'}
                          {sf.status === 'done' && (sf.loadNumber ? `Load #${sf.loadNumber}` : 'Done')}
                          {sf.status === 'failed' && (
                            <span className="text-destructive">{sf.errorMessage || 'Failed'}</span>
                          )}
                        </p>
                      </div>

                      {/* Remove button (only in ready state) */}
                      {sf.status === 'ready' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(sf.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bottom actions */}
                <div className="border-t border-border p-4 space-y-3">
                  {/* Options — only before extracting */}
                  {!isExtracting && (
                    <>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="force-reimport"
                          checked={forceReimport}
                          onCheckedChange={(checked) => setForceReimport(checked === true)}
                        />
                        <Label htmlFor="force-reimport" className="text-xs text-muted-foreground cursor-pointer">
                          Reimport previously uploaded files
                        </Label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          <Label htmlFor="vision-toggle" className="text-xs text-muted-foreground cursor-pointer">
                            Vision mode
                          </Label>
                        </div>
                        <Switch id="vision-toggle" checked={useVision} onCheckedChange={setUseVision} />
                      </div>
                    </>
                  )}

                  {/* CTA */}
                  {!isExtracting && (
                    <Button size="lg" className="w-full" onClick={handleExtract} disabled={retryableCount === 0}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      {failedCount > 0 ? 'Retry with Sally' : 'Extract with Sally'}
                      {retryableCount > 1 && (
                        <span className="ml-1.5 bg-background/20 text-inherit text-xs px-1.5 py-0.5 rounded-full font-semibold">
                          {retryableCount}
                        </span>
                      )}
                    </Button>
                  )}

                  {/* Extracting status */}
                  {phase === 'extracting' && processingCount > 0 && (
                    <div className="text-center space-y-2">
                      <div className="relative mx-auto w-10 h-10">
                        <div className="w-10 h-10 rounded-full border-2 border-muted flex items-center justify-center">
                          <Sparkles className="h-4 w-4 text-foreground" />
                        </div>
                        <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Processing {processingCount} of {files.length}...
                      </p>
                      <p className="text-xs text-muted-foreground">You can close this — loads will appear in Drafts.</p>
                    </div>
                  )}

                  {/* Done */}
                  {phase === 'done' && (
                    <div className="text-center space-y-3">
                      {doneCount > 0 && (
                        <p className="text-sm text-foreground">
                          {doneCount} load{doneCount > 1 ? 's' : ''} created as draft{doneCount > 1 ? 's' : ''}
                        </p>
                      )}
                      {failedCount > 0 && (
                        <p className="text-xs text-destructive">
                          {failedCount} file{failedCount > 1 ? 's' : ''} failed
                        </p>
                      )}
                      <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile bottom bar */}
              <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background p-4 z-10">
                {!isExtracting && (
                  <Button className="w-full" onClick={handleExtract} disabled={readyCount === 0}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Extract{files.length > 1 ? ` All (${files.length})` : ' with Sally'}
                  </Button>
                )}
                {phase === 'extracting' && (
                  <p className="text-sm text-muted-foreground text-center">
                    Processing {processingCount} of {files.length}...
                  </p>
                )}
                {phase === 'done' && (
                  <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                    {doneCount > 0 ? `Done — ${doneCount} load${doneCount > 1 ? 's' : ''} created` : 'Close'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="hidden"
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
