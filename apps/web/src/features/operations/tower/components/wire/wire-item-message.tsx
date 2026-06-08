'use client';

import { formatLoadLabel, type WireItem as WireItemType } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { WireItemShell } from './wire-item-shell';
import { WireActionBar } from './wire-action-bar';
import { useTowerInteraction } from '../../context/tower-interaction.context';

interface WireItemMessageProps {
  item: WireItemType;
}

/**
 * Driver-message wire item — shown in the "All" tab as a real-time pulse
 * event. A context line names the driver and (when the message is tagged to
 * one) the load. Replying happens in the dedicated Messages tab; this item
 * only offers "Open load", and only when the message is load-tagged.
 */
export function WireItemMessage({ item }: WireItemMessageProps) {
  const { openLoad } = useTowerInteraction();
  const loadId = item.relatedLoadId;
  const driverName = item.relatedDriverName;
  const text = item.text.trim();

  return (
    <WireItemShell
      stripeClassName="bg-blue-500 dark:bg-blue-400"
      timestamp={item.timestamp}
      ariaLabel={`Message${driverName ? ` from ${driverName}` : ''}: ${text}`}
    >
      {/* Context line — who, and which load (if tagged). */}
      {(driverName || loadId) && (
        <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          {driverName && <span className="font-medium text-foreground">{driverName}</span>}
          {driverName && loadId && <span aria-hidden>·</span>}
          {loadId && <span>{formatLoadLabel(loadId, item.relatedLoadReference)}</span>}
        </div>
      )}
      {/* Guard the quotes — an empty text would otherwise render bare “”. */}
      {text ? (
        <span className="italic">&ldquo;{text}&rdquo;</span>
      ) : (
        <span className="italic text-muted-foreground">New message</span>
      )}
      {loadId && (
        <WireActionBar>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-2xs"
            aria-label="Open load"
            onClick={() => openLoad(loadId)}
          >
            Open load
          </Button>
        </WireActionBar>
      )}
    </WireItemShell>
  );
}
