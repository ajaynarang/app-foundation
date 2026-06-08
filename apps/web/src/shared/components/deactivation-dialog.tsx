'use client';

import { useState } from 'react';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import { Textarea } from '@app/ui/components/ui/textarea';
import { Label } from '@app/ui/components/ui/label';

interface DeactivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'customer' | 'driver' | 'vehicle' | 'trailer';
  entityName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
  blockers?: { message: string; items: string[] } | null;
}

export function DeactivationDialog({
  open,
  onOpenChange,
  entityType,
  entityName,
  onConfirm,
  isLoading,
  blockers,
}: DeactivationDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason('');
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) setReason('');
        onOpenChange(newOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blockers ? `Cannot Deactivate ${entityName}` : `Deactivate ${entityName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {blockers ? (
              <div className="space-y-2">
                <p>{blockers.message}</p>
                <ul className="list-disc pl-4 space-y-1">
                  {blockers.items.map((item, i) => (
                    <li key={i} className="text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span>
                This will remove {entityName} from active operations. They will no longer appear in dispatch or
                assignment lists.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!blockers && (
          <div className="space-y-2 py-2">
            <Label htmlFor="deactivation-reason">Reason *</Label>
            <Textarea
              id="deactivation-reason"
              placeholder={`Why is this ${entityType} being deactivated?`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This can be reversed by reactivating from the inactive list.
            </p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{blockers ? 'OK' : 'Cancel'}</AlertDialogCancel>
          {!blockers && (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={!reason.trim() || isLoading}
              className="bg-critical hover:bg-critical/90 text-white"
            >
              {isLoading ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DecommissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
  blockers?: { message: string; items: string[] } | null;
}

export function DecommissionDialog({
  open,
  onOpenChange,
  entityName,
  onConfirm,
  isLoading,
  blockers,
}: DecommissionDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason('');
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) setReason('');
        onOpenChange(newOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blockers ? `Cannot Decommission ${entityName}` : `Decommission ${entityName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {blockers ? (
              <div className="space-y-2">
                <p>{blockers.message}</p>
                <ul className="list-disc pl-4 space-y-1">
                  {blockers.items.map((item, i) => (
                    <li key={i} className="text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <span>
                This will permanently mark {entityName} as decommissioned (sold, scrapped, or totaled). This action
                cannot be reversed.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!blockers && (
          <div className="space-y-2 py-2">
            <Label htmlFor="decommission-reason">Reason *</Label>
            <Textarea
              id="decommission-reason"
              placeholder="Why is this vehicle being decommissioned? (e.g., sold, scrapped, totaled)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-critical">This is permanent and cannot be undone.</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{blockers ? 'OK' : 'Cancel'}</AlertDialogCancel>
          {!blockers && (
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={!reason.trim() || isLoading}
              className="bg-critical hover:bg-critical/90 text-white"
            >
              {isLoading ? 'Decommissioning...' : 'Decommission'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ReactivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  deactivatedAt?: string | null;
  deactivationReason?: string | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ReactivationDialog({
  open,
  onOpenChange,
  entityName,
  deactivatedAt,
  deactivationReason,
  onConfirm,
  isLoading,
}: ReactivationDialogProps) {
  const { formatTimestamp } = useFormatters();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reactivate {entityName}?</AlertDialogTitle>
          <AlertDialogDescription>This will restore {entityName} to active operations.</AlertDialogDescription>
        </AlertDialogHeader>

        {(deactivatedAt || deactivationReason) && (
          <div className="space-y-1 py-2 text-sm text-muted-foreground">
            {deactivatedAt && <p>Deactivated: {formatTimestamp(deactivatedAt, DISPLAY_FORMATS.FRIENDLY)}</p>}
            {deactivationReason && <p>Reason: &quot;{deactivationReason}&quot;</p>}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Reactivating...' : 'Reactivate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
