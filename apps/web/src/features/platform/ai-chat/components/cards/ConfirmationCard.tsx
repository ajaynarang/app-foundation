'use client';

import { Button } from '@app/ui/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAssistantStore } from '../../store';
import type { ConfirmationCardData } from '../../engine/types';

export function ConfirmationCard({ data }: { data: Record<string, unknown> }) {
  const card = data as unknown as ConfirmationCardData;
  const { pendingConfirmation, confirmAction, cancelAction } = useAssistantStore();
  const isPending = !!pendingConfirmation;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{card.action}</p>
        <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
      </div>
      {isPending && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => confirmAction()}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={() => cancelAction()}>
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      )}
      {!isPending && <p className="text-xs text-muted-foreground italic">Action completed</p>}
    </div>
  );
}
