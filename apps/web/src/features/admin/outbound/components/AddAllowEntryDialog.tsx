'use client';

import { useState, type FormEvent } from 'react';
import type { OutboundAllowKind } from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { ALLOW_KIND_OPTIONS } from '../constants';
import { useAddOutboundAllowEntry } from '../hooks';

interface AddAllowEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Three fields, one quick action: a Dialog. */
export function AddAllowEntryDialog({ open, onOpenChange }: AddAllowEntryDialogProps) {
  const [kind, setKind] = useState<OutboundAllowKind>('EMAIL');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const addEntry = useAddOutboundAllowEntry();
  const option = ALLOW_KIND_OPTIONS.find((candidate) => candidate.kind === kind) ?? ALLOW_KIND_OPTIONS[0];

  const close = (next: boolean) => {
    if (!next) {
      setValue('');
      setNote('');
    }
    onOpenChange(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    addEntry.mutate({ kind, value: value.trim(), note: note.trim() || undefined }, { onSuccess: () => close(false) });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Allow a recipient</DialogTitle>
            <DialogDescription>
              Messages from this environment reach only the recipients on this list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="allow-kind">Type</Label>
            <Select value={kind} onValueChange={(next) => setKind(next as OutboundAllowKind)}>
              <SelectTrigger id="allow-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOW_KIND_OPTIONS.map((candidate) => (
                  <SelectItem key={candidate.kind} value={candidate.kind}>
                    {candidate.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{option.hint}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allow-value">{option.label}</Label>
            <Input
              id="allow-value"
              autoFocus
              value={value}
              placeholder={option.placeholder}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="allow-note">Note (optional)</Label>
            <Input
              id="allow-note"
              value={note}
              maxLength={200}
              placeholder="Whose is this?"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={addEntry.isPending} disabled={!value.trim()}>
              Allow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
