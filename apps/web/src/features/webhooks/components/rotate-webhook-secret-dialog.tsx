'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { CopyButton } from '@app/ui/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
import { Label } from '@app/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { useRotateWebhookSecret } from '../use-webhooks';

const OVERLAP_OPTIONS = [
  { hours: 24, label: '24 hours (recommended)' },
  { hours: 72, label: '3 days' },
  { hours: 1, label: '1 hour' },
  { hours: 0, label: 'None: the old secret stops now' },
];
const DEFAULT_OVERLAP_HOURS = '24';

export interface RotateWebhookSecretDialogProps {
  webhookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Rotates a webhook's signing secret. During the overlap every delivery carries two signatures (one per secret),
 * so the receiver can switch to the new secret without missing an event. The new secret is shown once.
 */
export function RotateWebhookSecretDialog({ webhookId, open, onOpenChange }: RotateWebhookSecretDialogProps) {
  const rotateMutation = useRotateWebhookSecret();
  const [overlapHours, setOverlapHours] = useState(DEFAULT_OVERLAP_HOURS);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setNewSecret(null);
      setOverlapHours(DEFAULT_OVERLAP_HOURS);
    }
    onOpenChange(isOpen);
  };

  const handleRotate = async () => {
    try {
      const rotated = await rotateMutation.mutateAsync({ id: webhookId, overlapHours: Number(overlapHours) });
      setNewSecret(rotated.signingSecret);
    } catch {
      // the mutation shows the error toast; the dialog stays open
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {newSecret === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Rotate the signing secret</DialogTitle>
              <DialogDescription>
                A new secret is shown once. The old one keeps signing alongside it for the overlap, so update your
                receiver within that time.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="rotate-overlap">Keep the old secret signing for</Label>
              <Select value={overlapHours} onValueChange={setOverlapHours}>
                <SelectTrigger id="rotate-overlap">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERLAP_OPTIONS.map((option) => (
                    <SelectItem key={option.hours} value={String(option.hours)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button loading={rotateMutation.isPending} onClick={handleRotate}>
                Rotate secret
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Your new signing secret</DialogTitle>
              <DialogDescription>Copy it into your receiver now. It will not be shown again.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {newSecret}
              </code>
              <CopyButton value={newSecret} label="Signing secret" />
            </div>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
