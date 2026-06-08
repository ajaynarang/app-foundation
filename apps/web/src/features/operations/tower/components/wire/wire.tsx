'use client';

import { useState } from 'react';
import { useWire, type WireTab } from '../../hooks/use-wire';
import { ShiftNotesSticky } from './shift-notes-sticky';
import { WireTabs } from './wire-tabs';
import { WireList } from './wire-list';
import { WireConnectionStatus } from './wire-connection-status';
import { MessageInbox } from './message-inbox/message-inbox';

/**
 * Right column. Sticky shift notes at the top, reconnect indicator + tabs
 * below, content under. SSE drives updates when connected; the list falls
 * back to a 30s poll while reconnecting. SSE storms coalesce inside WireList.
 *
 * The "Messages" tab is a driver-conversation triage inbox; every other tab
 * is the chronological wire feed (the "All" tab still shows message events).
 */
export function Wire() {
  const [tab, setTab] = useState<WireTab>('all');
  const wire = useWire(tab);

  return (
    <section
      aria-label="Wire"
      className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background"
    >
      <ShiftNotesSticky />
      <WireConnectionStatus />
      <WireTabs value={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto">
        {tab === 'message' ? (
          <MessageInbox />
        ) : (
          <WireList items={wire.data ?? []} isLoading={wire.isLoading} isError={wire.isError} />
        )}
      </div>
    </section>
  );
}
