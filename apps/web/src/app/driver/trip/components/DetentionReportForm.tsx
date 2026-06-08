'use client';

import { useState, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { useCreateDriverAction } from '@/features/fleet/loads/hooks/use-driver-actions';

interface DetentionReportFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  stopId?: number;
}

export function DetentionReportForm({ open, onOpenChange, loadId, stopId }: DetentionReportFormProps) {
  const [note, setNote] = useState('');
  const createAction = useCreateDriverAction();

  const handleSubmit = useCallback(() => {
    createAction.mutate(
      { loadId, actionType: 'detention', stopId, note: note || undefined },
      {
        onSuccess: () => {
          setNote('');
          onOpenChange(false);
        },
      },
    );
  }, [note, loadId, stopId, createAction, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-400/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-yellow-400" />
            </div>
            Report Detention
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Report excessive wait time at the facility. Dispatch will be notified and can add a detention charge.
          </p>

          <div>
            <Label htmlFor="detention-note" className="text-xs text-muted-foreground">
              Notes (optional)
            </Label>
            <Textarea
              id="detention-note"
              placeholder="e.g. Waiting 3+ hours at dock, no unloading crew available"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="flex-1" loading={createAction.isPending} onClick={handleSubmit}>
              Report Detention
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
