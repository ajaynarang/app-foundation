'use client';

import type { WireItem as WireItemType } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { WireItemShell } from './wire-item-shell';
import { WireActionBar } from './wire-action-bar';
import { useTowerInteraction } from '../../context/tower-interaction.context';

interface WireItemOpsProps {
  item: WireItemType;
}

export function WireItemOps({ item }: WireItemOpsProps) {
  const { openLoad } = useTowerInteraction();

  return (
    <WireItemShell
      stripeClassName="bg-muted-foreground/30"
      timestamp={item.timestamp}
      ariaLabel={`Operations: ${item.text}`}
    >
      <span className="text-muted-foreground">{item.text}</span>
      {item.relatedLoadId && (
        <WireActionBar>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={() => openLoad(item.relatedLoadId!)}>
            Open load
          </Button>
        </WireActionBar>
      )}
    </WireItemShell>
  );
}
