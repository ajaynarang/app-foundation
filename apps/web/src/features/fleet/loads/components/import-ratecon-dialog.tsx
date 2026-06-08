'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Label } from '@sally/ui/components/ui/label';
import { Switch } from '@sally/ui/components/ui/switch';
import { loadsApi } from '../api';
import { RateconUploadZone, type StagedFile } from './ratecon-upload-zone';

interface ImportRateconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onQueued: (count: number, jobIds: number[]) => void;
}

export function ImportRateconDialog({ open, onOpenChange, onQueued }: ImportRateconDialogProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [forceReimport, setForceReimport] = useState(false);
  const [parserConfig, setParserConfig] = useState<{ defaultStrategy: string; allowUserOverride: boolean } | null>(
    null,
  );
  const [useVision, setUseVision] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);

  useEffect(() => {
    if (open) {
      loadsApi
        .getParserConfig()
        .then(setParserConfig)
        .catch(() => {});
    }
  }, [open]);

  const reset = useCallback(() => {
    setIsUploading(false);
    setUploadError(null);
    setForceReimport(false);
    setUseVision(false);
    setStagedFiles([]);
  }, []);

  const handleImport = useCallback(async () => {
    if (stagedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    const strategy = useVision ? 'vision' : undefined;

    try {
      const results = await Promise.allSettled(
        stagedFiles.map((sf) => loadsApi.parseRatecon(sf.file, forceReimport, strategy)),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
        jobId: number;
        status: string;
        fileName: string;
      }>[];
      const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

      if (failures.length > 0 && fulfilled.length === 0) {
        const duplicates = failures.filter((r) => r.reason?.status === 409);
        if (duplicates.length > 0) {
          const dupMsg = duplicates.map((r) => `Already imported as ${r.reason.loadNumber}`).join('. ');
          setUploadError(dupMsg);
        } else {
          setUploadError(failures[0].reason?.message || 'Failed to upload files');
        }
        setIsUploading(false);
        return;
      }

      const jobIds = fulfilled.map((r) => r.value.jobId);

      // Close dialog and notify
      reset();
      onOpenChange(false);
      onQueued(fulfilled.length, jobIds);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload files');
      setIsUploading(false);
    }
  }, [stagedFiles, reset, onOpenChange, onQueued, forceReimport, useVision]);

  const handleRemoveFile = useCallback((id: string) => {
    setStagedFiles((prev) => prev.filter((sf) => sf.id !== id));
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (isUploading) return; // prevent closing while uploading
      if (!open) reset();
      onOpenChange(open);
    },
    [reset, onOpenChange, isUploading],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg overflow-hidden"
        onInteractOutside={isUploading ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>Import Rate Confirmations</DialogTitle>
        </DialogHeader>

        {isUploading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Uploading {stagedFiles.length} file{stagedFiles.length > 1 ? 's' : ''}...
              </p>
              <p className="text-xs text-muted-foreground mt-1">Your files will be processed in the background.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Reimport checkbox — first, before upload zone */}
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

            {/* Upload zone with staged file list */}
            <RateconUploadZone
              stagedFiles={stagedFiles}
              onFilesStaged={setStagedFiles}
              onRemoveFile={handleRemoveFile}
              isUploading={isUploading}
              error={uploadError}
            />

            {/* Vision mode toggle */}
            {parserConfig?.allowUserOverride && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="mr-3">
                  <p className="text-sm font-medium text-foreground">Vision mode</p>
                  <p className="text-xs text-muted-foreground">For scanned or image-heavy PDFs</p>
                </div>
                <Switch checked={useVision} onCheckedChange={setUseVision} />
              </div>
            )}

            {/* CTA row */}
            {stagedFiles.length > 0 ? (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-shrink-0"
                  onClick={() => {
                    setStagedFiles([]);
                    setUploadError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleImport}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import
                  <span className="ml-1.5 bg-background/20 text-inherit text-xs px-1.5 py-0.5 rounded-full font-semibold">
                    {stagedFiles.length}
                  </span>
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Files are processed in the background. Completed loads appear in{' '}
                <span className="font-medium text-foreground">Drafts</span>.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
