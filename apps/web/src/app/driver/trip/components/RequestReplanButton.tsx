'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { useRequestReplan } from '@/features/routing/route-planning/hooks/use-driver-route-plan';

interface Props {
  planId: string;
}

export function RequestReplanButton({ planId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mutation = useRequestReplan();

  const handleSubmit = () => {
    mutation.mutate(
      { planId, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setReason('');
        },
      },
    );
  };

  return (
    <>
      <Button
        variant="outline"
        className="w-full min-h-[44px] gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="h-4 w-4" />
        Request Route Replan
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pb-8"
          onInteractOutside={(e) => {
            if (mutation.isPending) e.preventDefault();
          }}
        >
          <div className="mx-auto w-10 h-1 bg-muted-foreground/30 rounded-full mb-6" />
          <SheetHeader className="text-left space-y-1 mb-4">
            <SheetTitle>Request a new smart route?</SheetTitle>
            <SheetDescription>
              Your dispatcher will be notified and will generate a new optimized route.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mb-6">
            <Textarea
              placeholder="Reason (optional) — e.g. road closure, weather, changed pickup time"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none min-h-[80px]"
              disabled={mutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Button className="w-full h-12" loading={mutation.isPending} onClick={handleSubmit}>
              Send Request
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-muted-foreground"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
