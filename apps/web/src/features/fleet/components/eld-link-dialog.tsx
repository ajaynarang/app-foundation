'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sally/ui/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Button } from '@sally/ui/components/ui/button';

interface EldLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'driver' | 'vehicle';
  candidates: { eldId: string; name: string; detail: string }[];
  onLink: (eldId: string) => void;
  isLinking: boolean;
}

export function EldLinkDialog({ open, onOpenChange, entityType, candidates, onLink, isLinking }: EldLinkDialogProps) {
  const [selectedEldId, setSelectedEldId] = useState<string>('');

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedEldId('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link {entityType === 'driver' ? 'Driver' : 'Vehicle'} to ELD</DialogTitle>
          <DialogDescription>
            Auto-match could not find an exact match. Please select the correct ELD {entityType} below.
          </DialogDescription>
        </DialogHeader>

        {/* Warning banner */}
        <div className="flex items-start gap-3 rounded-md border border-caution/20 bg-caution/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
          <p className="text-sm text-foreground">
            Linking will associate HOS and GPS data from this ELD record with the selected {entityType}. Ensure you pick
            the correct match.
          </p>
        </div>

        {/* Candidate picker */}
        <div className="space-y-2">
          <Select value={selectedEldId} onValueChange={setSelectedEldId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select ELD ${entityType}...`} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.eldId} value={c.eldId}>
                  {c.name} &mdash; {c.detail}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLinking}>
            Cancel
          </Button>
          <Button onClick={() => onLink(selectedEldId)} disabled={!selectedEldId || isLinking} loading={isLinking}>
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
