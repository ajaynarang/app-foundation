'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { WireAction, WireItem as WireItemType } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { WireItemShell } from './wire-item-shell';
import { WireActionBar } from './wire-action-bar';
import { useWireActions } from '../../hooks/use-wire-actions';

interface WireItemDeskProps {
  item: WireItemType;
}

/** Desk accept/decline payloads carry the approval id to decide on. */
function approvalIdFor(action: WireAction | undefined): string | undefined {
  const fromPayload = action?.payload?.approvalId;
  return typeof fromPayload === 'string' ? fromPayload : undefined;
}

export function WireItemDesk({ item }: WireItemDeskProps) {
  const anchor = item.deskAnchor;
  const { acceptDesk, declineDesk, isDeciding } = useWireActions();
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const acceptAction = item.actions?.find((a) => a.kind === 'accept-desk');
  const declineAction = item.actions?.find((a) => a.kind === 'decline-desk');
  const acceptId = approvalIdFor(acceptAction);
  const declineId = approvalIdFor(declineAction);

  // Acting on a Desk item collapses the row to a confirmation line.
  if (confirmed) {
    return (
      <WireItemShell
        stripeClassName="bg-muted-foreground/50"
        timestamp={item.timestamp}
        ariaLabel={`Desk update: ${confirmed}`}
      >
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {confirmed} · running on Desk
        </span>
      </WireItemShell>
    );
  }

  return (
    <WireItemShell
      stripeClassName="bg-muted-foreground/50"
      timestamp={item.timestamp}
      ariaLabel={`Desk update: ${item.text}`}
    >
      <span className="text-muted-foreground mr-1" aria-hidden>
        ⊙
      </span>
      <span>{item.text}</span>
      {anchor && (
        <Link
          href={`/dispatcher/desk?episode=${encodeURIComponent(anchor.episodeId)}`}
          className="ml-1.5 inline-flex items-center text-xs text-foreground hover:underline"
        >
          ↗ Desk · {anchor.responsibilityType}
        </Link>
      )}
      {(acceptAction || declineAction) && (
        <WireActionBar>
          {acceptAction && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-2xs"
              loading={isDeciding}
              disabled={!acceptId}
              onClick={() => acceptId && acceptDesk(acceptId, () => setConfirmed(acceptAction.label))}
            >
              {acceptAction.label}
            </Button>
          )}
          {declineAction && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-2xs"
              loading={isDeciding}
              disabled={!declineId}
              onClick={() => declineId && declineDesk(declineId, () => setConfirmed(declineAction.label))}
            >
              {declineAction.label}
            </Button>
          )}
        </WireActionBar>
      )}
    </WireItemShell>
  );
}
