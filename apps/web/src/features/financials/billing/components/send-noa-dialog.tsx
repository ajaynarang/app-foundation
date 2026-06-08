'use client';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useSendNoa } from '../hooks/use-noa';

export interface SendNoaDialogContext {
  noaId: string;
  customerName: string;
  factoringCompanyName: string;
  recipientHint?: string | null;
  senderHint?: string | null;
}

interface SendNoaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: SendNoaDialogContext | null;
}

/**
 * Confirms the NOA send flow. Backend resolves the recipient at send-time
 * (primary contact email, then billingEmail); the hint shown here is for
 * dispatcher confirmation only — the canonical send is whatever
 * `noaService.sendNoaEmail` resolves on the server.
 */
export function SendNoaDialog({ open, onOpenChange, context }: SendNoaDialogProps) {
  const sendMutation = useSendNoa();

  const handleSend = () => {
    if (!context) return;
    sendMutation.mutate(context.noaId, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!sendMutation.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Notice of Assignment</DialogTitle>
        </DialogHeader>

        {!context ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <span className="text-muted-foreground">To</span>
              <span className="col-span-2 text-foreground">
                {context.customerName}
                {context.recipientHint ? (
                  <span className="block text-xs text-muted-foreground">{context.recipientHint}</span>
                ) : (
                  <span className="block text-xs text-muted-foreground">
                    Recipient resolved at send (primary contact, then billing email)
                  </span>
                )}
              </span>

              <span className="text-muted-foreground">Factor</span>
              <span className="col-span-2 text-foreground">{context.factoringCompanyName}</span>

              <span className="text-muted-foreground">From</span>
              <span className="col-span-2 text-foreground">
                {context.senderHint ?? 'Sally backend transactional address'}
              </span>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Letter preview</p>
              <p>
                This letter notifies {context.customerName} that all future invoices from your company will be assigned
                to {context.factoringCompanyName}. Payment for any open or future invoice should be remitted directly to
                the factor at the address on file.
              </p>
              <p className="mt-2 italic">A signed PDF will be attached to the email.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sendMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} loading={sendMutation.isPending} disabled={!context}>
            Send NOA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
