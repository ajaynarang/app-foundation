'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { useResolveFeedback } from '../hooks/use-admin-feedback';

interface ResolvePopoverProps {
  feedbackId: number;
  children: React.ReactNode;
}

export function ResolvePopover({ feedbackId, children }: ResolvePopoverProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const { mutate: resolve, isPending } = useResolveFeedback();

  const handleResolve = () => {
    if (!note.trim()) return;
    resolve(
      { id: feedbackId, note: note.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setNote('');
        },
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Resolution Note</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What action was taken..."
            rows={3}
            autoFocus
          />
          <Button
            onClick={handleResolve}
            disabled={!note.trim() || isPending}
            loading={isPending}
            size="sm"
            className="w-full"
          >
            <Check className="h-4 w-4 mr-1" />
            Resolve
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
