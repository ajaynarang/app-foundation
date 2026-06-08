'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle2, X, RotateCcw, Clock } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { GHOST_IMPORT_STATUS, type GhostImport } from '@/features/fleet/loads/types/ratecon';

const MAX_RETRIES = 3;
const STALE_WARNING_MS = 2 * 60 * 1000; // 2 minutes
const STALE_ACTION_MS = 5 * 60 * 1000; // 5 minutes

interface GhostImportCardProps {
  ghost: GhostImport;
  /** Dismiss a finished (failed) card — only hides it locally, leaves the job record. */
  onDismiss: (jobId: number) => void;
  /** Cancel an in-flight (processing/queued) job — stops it server-side so it doesn't resurrect on reload. */
  onCancel: (jobId: number) => void;
  onRetry: (jobId: number) => void;
  onCheckStatus: (jobId: number) => void;
  onClick?: (ghost: GhostImport) => void;
}

export function GhostImportCard({ ghost, onDismiss, onCancel, onRetry, onCheckStatus, onClick }: GhostImportCardProps) {
  const [elapsed, setElapsed] = useState(0);

  // Track elapsed time for staleness detection (processing only)
  useEffect(() => {
    if (ghost.status !== GHOST_IMPORT_STATUS.PROCESSING) return;

    const update = () => setElapsed(Date.now() - new Date(ghost.startedAt).getTime());
    update(); // initial

    const interval = setInterval(update, 10_000); // every 10s
    return () => clearInterval(interval);
  }, [ghost.status, ghost.startedAt]);

  const isStaleWarning = ghost.status === GHOST_IMPORT_STATUS.PROCESSING && elapsed > STALE_WARNING_MS;
  const isStaleAction = ghost.status === GHOST_IMPORT_STATUS.PROCESSING && elapsed > STALE_ACTION_MS;

  // Completed state — brief display before morph
  if (ghost.status === GHOST_IMPORT_STATUS.COMPLETED) {
    return (
      <Card className="border-border bg-accent/10 animate-in fade-in-0 duration-300">
        <CardContent className="p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">Load #{ghost.loadNumber} created</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Failed state — clickable, with retry and dismiss
  if (ghost.status === GHOST_IMPORT_STATUS.FAILED) {
    return (
      <Card
        className="border-dashed border-destructive/50 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors"
        onClick={() => onClick?.(ghost)}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{ghost.fileName}</p>
              <p className="text-xs text-destructive truncate">{ghost.errorMessage || 'Processing failed'}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(ghost.jobId);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {ghost.retryCount < MAX_RETRIES ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(ghost.jobId);
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry ({ghost.retryCount}/{MAX_RETRIES})
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center">Max retries reached — try manual import</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Processing state — with dismiss button and staleness detection
  return (
    <Card className="border-dashed border-border bg-muted/30">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{ghost.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {isStaleWarning ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Taking longer than usual...
                </span>
              ) : (
                'Sally is processing...'
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label="Cancel import"
            title="Cancel import"
            onClick={(e) => {
              e.stopPropagation();
              // In-flight: X cancels the job server-side (not a local dismiss),
              // so it won't reappear on the next load.
              onCancel(ghost.jobId);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Indeterminate progress bar */}
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-foreground/30 rounded-full animate-pulse" />
        </div>

        {isStaleAction && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onCheckStatus(ghost.jobId);
              }}
            >
              Check Status
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(ghost.jobId);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
