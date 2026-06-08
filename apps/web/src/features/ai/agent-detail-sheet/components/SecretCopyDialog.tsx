'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sally/ui/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Button } from '@sally/ui/components/ui/button';
import { showSuccess } from '@sally/ui';
import { Copy } from 'lucide-react';

interface SecretCopyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  secret: string;
}

/**
 * One-time secret display (API-key plaintext, OAuth secret, etc.). The
 * user must click Copy once before "I saved it" becomes enabled; closing
 * via X or Escape triggers a confirm-dialog since the value cannot be
 * recovered.
 */
export function SecretCopyDialog({ open, onOpenChange, title, description, secret }: SecretCopyDialogProps) {
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    showSuccess('Copied to clipboard');
  };

  const handleDoneClose = () => {
    setCopied(false);
    onOpenChange(false);
  };

  const handleAttemptClose = (next: boolean) => {
    if (!next && !copied) {
      setConfirmClose(true);
      return;
    }
    if (!next) handleDoneClose();
    else onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleAttemptClose}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted p-3 font-mono text-sm text-foreground break-all">
            {secret}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleCopy} size="sm">
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleDoneClose} disabled={!copied}>
              I saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You’re closing without saving the secret</AlertDialogTitle>
            <AlertDialogDescription>This value cannot be recovered. Continue?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                handleDoneClose();
              }}
            >
              Close anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
