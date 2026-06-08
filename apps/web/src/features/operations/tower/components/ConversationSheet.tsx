'use client';

import { useMemo } from 'react';
import { formatLoadLabel, type LookaheadHours } from '@sally/shared-types';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { DriverThread } from './wire/message-inbox/driver-thread';
import { useDriverConversations } from '../hooks/use-driver-conversations';
import { useActiveLoads } from '../hooks/use-active-loads';

interface ConversationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The driver whose thread to show, or null when the sheet is closed. */
  driverId: string | null;
  /** Lookahead window — used to resolve the driver's active loads. */
  lookaheadHours: LookaheadHours;
}

/**
 * Tower conversation sheet — the full message thread for one driver. Opened
 * from the Messages-tab triage list via the Tower interaction context.
 *
 * Built on `FormSheet` (view mode) so it gets the standard sheet chrome —
 * pin, drag-to-resize, and the ◧ ◨ □ size controls — like every other sheet.
 */
export function ConversationSheet({ open, onOpenChange, driverId, lookaheadHours }: ConversationSheetProps) {
  const { data: conversations } = useDriverConversations();
  const { data: activeLoads } = useActiveLoads(lookaheadHours);

  const conversation = useMemo(
    () => conversations?.find((c) => c.driverId === driverId) ?? null,
    [conversations, driverId],
  );

  // The driver's active load numbers — feed the composer's @-mention picker.
  const activeLoadNumbers = useMemo(
    () => (activeLoads ?? []).filter((l) => l.driver.driverId === driverId).map((l) => l.loadNumber),
    [activeLoads, driverId],
  );

  if (!driverId) return null;

  const driverName = conversation?.driverName ?? 'Driver';

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Conversation with ${driverName}`}
      titleNode={
        <span className="flex flex-col">
          <span className="font-semibold text-foreground">{driverName}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {conversation?.currentLoadNumber
              ? `On ${formatLoadLabel(conversation.currentLoadNumber, conversation.currentLoadReference)}`
              : 'No active load'}
          </span>
        </span>
      }
      mode="view"
      pinnable
      resizable
      entityType="tower-conversation"
    >
      <div className="flex h-full min-h-0 flex-col">
        <DriverThread driverId={driverId} activeLoadNumbers={activeLoadNumbers} />
      </div>
    </FormSheet>
  );
}
