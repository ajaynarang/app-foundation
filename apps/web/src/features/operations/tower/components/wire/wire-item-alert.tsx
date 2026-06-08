'use client';

import type { WireItem as WireItemType } from '@sally/shared-types';
import { Button } from '@sally/ui/components/ui/button';
import { WireItemShell } from './wire-item-shell';
import { WireActionBar } from './wire-action-bar';
import { useTowerInteraction } from '../../context/tower-interaction.context';
import { useWireActions } from '../../hooks/use-wire-actions';

interface WireItemAlertProps {
  item: WireItemType;
}

const STRIPE_BY_SEVERITY: Record<WireItemType['severity'], string> = {
  critical: 'bg-red-500',
  caution: 'bg-yellow-500',
  info: 'bg-muted-foreground/40',
};

/** Spelled-out severity so the stripe colour is never the only signal. */
const SEVERITY_LABEL: Record<WireItemType['severity'], string> = {
  critical: 'Critical alert',
  caution: 'Caution alert',
  info: 'Alert',
};

/** The alert wire action payload may carry the alert id to snooze. */
function alertIdFor(item: WireItemType): string | undefined {
  const muteAction = item.actions?.find((a) => a.kind === 'mute');
  const fromPayload = muteAction?.payload?.alertId;
  return typeof fromPayload === 'string' ? fromPayload : undefined;
}

export function WireItemAlert({ item }: WireItemAlertProps) {
  const { openLoad } = useTowerInteraction();
  const { muteAlert, isMuting } = useWireActions();
  const alertId = alertIdFor(item);

  return (
    <WireItemShell
      stripeClassName={STRIPE_BY_SEVERITY[item.severity]}
      timestamp={item.timestamp}
      ariaLabel={`${SEVERITY_LABEL[item.severity]}: ${item.text}`}
    >
      <span>{item.text}</span>
      <WireActionBar>
        {item.relatedLoadId && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-2xs"
            onClick={() => openLoad(item.relatedLoadId!)}
          >
            Open load
          </Button>
        )}
        {/* The wire feed attaches `alertId` to the mute action payload; the
            button stays disabled only for the rare item that lacks one. */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-2xs"
          loading={isMuting}
          disabled={!alertId}
          onClick={() => alertId && muteAlert(alertId)}
        >
          Mute 1h
        </Button>
      </WireActionBar>
    </WireItemShell>
  );
}
