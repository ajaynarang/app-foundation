'use client';

import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { useRemoveExchange, useRemoveExchangePreview } from '../hooks/use-load-legs';
import type { ExchangeRemovalPreview, ExchangeRemovalResolution } from '@sally/shared-types';

interface RemoveExchangeAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  stopId: number | null;
  /** Best-effort display name from the editor's row — falls back to preview data once it lands. */
  stopDisplayName?: string;
  onRemoved?: () => void;
}

/**
 * Confirmation dialog for removing an exchange point from a relay load.
 *
 * The backend infers what removal *means* for this stop (delete the row
 * entirely vs revert it to a delivery) — see LoadLegService.classifyExchangeRemoval.
 * The dialog reads that preview *before* the user confirms so the copy can
 * accurately describe what will happen.
 *
 * On the rare ambiguous case (preview returns `ambiguous: true`), the dialog
 * shows two destructive choices and forwards the user's selection to the
 * DELETE endpoint via the `?resolve=…` query param.
 */
export function RemoveExchangeAlertDialog({
  open,
  onOpenChange,
  loadId,
  stopId,
  stopDisplayName,
  onRemoved,
}: RemoveExchangeAlertDialogProps) {
  const { data: preview, isLoading: previewLoading } = useRemoveExchangePreview(loadId, stopId, { enabled: open });
  const removeMutation = useRemoveExchange();
  // `reset` is reference-stable across renders (bound once by TanStack's
  // observer); the `removeMutation` result object is NOT — useMutation rebuilds
  // it every render. Depend on the stable method, never the whole object, or
  // this effect re-runs every render and reset()'s store notification drives an
  // infinite render loop ("Maximum update depth exceeded").
  const { reset: resetRemoveMutation } = removeMutation;

  // Track the forced resolution chosen by the user on the ambiguous branch.
  // Reset both the local selection and the mutation state when the dialog
  // closes so reopening doesn't bleed in a previous error or pending flag.
  const [pendingResolve, setPendingResolve] = useState<ExchangeRemovalResolution | null>(null);
  useEffect(() => {
    if (!open) {
      setPendingResolve(null);
      resetRemoveMutation();
    }
  }, [open, resetRemoveMutation]);

  const handleRemove = (resolve?: ExchangeRemovalResolution) => {
    if (stopId == null) return;
    setPendingResolve(resolve ?? null);
    removeMutation.mutate(
      { loadId, stopId, resolve },
      {
        onSuccess: () => {
          onRemoved?.();
          onOpenChange(false);
        },
        onError: (error: Error) => {
          showError('Failed to remove exchange point', extractErrorMessage(error));
          setPendingResolve(null);
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          {previewLoading ? (
            <>
              <AlertDialogTitle>Remove handoff?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </AlertDialogDescription>
            </>
          ) : (
            <ResolvedHeader preview={preview} stopDisplayName={stopDisplayName} />
          )}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>

          {preview?.ambiguous ? (
            <>
              <Button
                variant="destructive"
                onClick={() => handleRemove('revert')}
                disabled={removeMutation.isPending}
                loading={removeMutation.isPending && pendingResolve === 'revert'}
              >
                Keep as delivery
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleRemove('delete')}
                disabled={removeMutation.isPending}
                loading={removeMutation.isPending && pendingResolve === 'delete'}
              >
                Delete location
              </Button>
            </>
          ) : (
            <Button
              variant="destructive"
              onClick={() => handleRemove()}
              disabled={previewLoading || removeMutation.isPending}
              loading={removeMutation.isPending}
            >
              Remove handoff
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResolvedHeader({
  preview,
  stopDisplayName,
}: {
  preview: ExchangeRemovalPreview | undefined;
  stopDisplayName?: string;
}) {
  // Fallback path when preview hasn't loaded but dialog is open.
  if (!preview) {
    return (
      <>
        <AlertDialogTitle>Remove handoff{stopDisplayName ? ` at ${stopDisplayName}` : ''}?</AlertDialogTitle>
        <AlertDialogDescription>
          This will remove the driver-exchange point from the load and rebuild the legs.
        </AlertDialogDescription>
      </>
    );
  }

  const name = preview.stopName || stopDisplayName || 'this location';

  if (preview.ambiguous) {
    return (
      <>
        <AlertDialogTitle>How should we remove this handoff?</AlertDialogTitle>
        <AlertDialogDescription>
          {name} doesn&apos;t fit a clear delete-or-revert pattern. Pick one — either keep it as a delivery on the load,
          or remove it entirely.
        </AlertDialogDescription>
      </>
    );
  }

  if (preview.resolution === 'delete') {
    return (
      <>
        <AlertDialogTitle>Remove handoff at {name}?</AlertDialogTitle>
        <AlertDialogDescription>
          {name} was added solely as a driver-exchange point. It will be removed from this load and the legs will be
          recomputed.
        </AlertDialogDescription>
      </>
    );
  }

  // revert
  return (
    <>
      <AlertDialogTitle>Remove handoff at {name}?</AlertDialogTitle>
      <AlertDialogDescription>
        The driver-exchange will be cleared. {name} will stay on this load as a delivery, and the legs will be
        recomputed.
      </AlertDialogDescription>
    </>
  );
}
