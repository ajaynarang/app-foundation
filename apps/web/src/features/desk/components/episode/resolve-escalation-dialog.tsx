'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';

import { useResolveEpisode } from '../../hooks/use-episodes';

interface ResolveEscalationDialogProps {
  episodeId: string;
  /** Called after a successful resolve so the parent sheet can close. */
  onResolved?: () => void;
}

/**
 * Resolve action for an escalated episode — a single optional-note field, so a
 * Dialog (not a Sheet, not an AlertDialog: it's not destructive). ESCALATED →
 * RESOLVED moves the episode off Needs-you into Handled. Shown only for
 * ESCALATED episodes; the caller gates on status.
 */
export function ResolveEscalationDialog({ episodeId, onResolved }: ResolveEscalationDialogProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const resolve = useResolveEpisode();

  const handleResolve = () => {
    resolve.mutate(
      { episodeId, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setNote('');
          onResolved?.();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 className="mr-1 h-4 w-4" />
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve escalation</DialogTitle>
          <DialogDescription>
            You&apos;ve handled this — it moves to Handled and stops needing you. Add a note if it helps the record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="resolve-note">Note (optional)</Label>
          <Textarea
            id="resolve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you do? — optional"
            maxLength={500}
            rows={3}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button onClick={handleResolve} loading={resolve.isPending}>
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
