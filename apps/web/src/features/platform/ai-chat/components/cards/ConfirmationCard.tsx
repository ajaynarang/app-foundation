'use client';

import { Button } from '@app/ui/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAssistantStore } from '../../store';
import type { ConfirmationCardData, ConfirmationOutcome } from '../../engine/types';

const OUTCOME_COPY: Record<ConfirmationOutcome, string> = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'No longer waiting. Ask again to make this change.',
};

/** One argument value as text: strings as they are, anything else as JSON. */
function argText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The confirm card for one exact write. Everything shown comes from the server-built card (the `9:` frame): the
 * action, the description and the exact arguments that run on Confirm, never the model's own words. Confirm and
 * Cancel appear only on the card the agent is waiting on, and send that card's `toolCallId`; an older card shows what
 * became of it.
 */
export function ConfirmationCard({ data }: { data: Record<string, unknown> }) {
  const card = data as unknown as ConfirmationCardData;
  const { pendingConfirmation, confirmationOutcomes, confirmAction, cancelAction } = useAssistantStore();
  const isPending = !!pendingConfirmation && pendingConfirmation.toolCallId === card.toolCallId;
  const outcome = card.toolCallId ? confirmationOutcomes[card.toolCallId] : undefined;
  const args = Object.entries(card.args ?? {}).filter(([, value]) => value !== undefined && value !== null);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{card.action}</p>
        <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
      </div>
      {args.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs" aria-label="What will run">
          {args.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="text-foreground break-words">{argText(value)}</dd>
            </div>
          ))}
        </dl>
      )}
      {isPending ? (
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
      ) : (
        <p className="text-xs text-muted-foreground italic">{outcome ? OUTCOME_COPY[outcome] : 'Answered'}</p>
      )}
    </div>
  );
}
