'use client';

import { useEffect, useState } from 'react';
import { useSseConnection } from '@/shared/realtime';
import { RECONNECTING_BANNER_AFTER_MS } from '../../constants';

/**
 * Reconnect affordance at the top of the Wire.
 *
 *  - SSE reconnecting (<30s): subtle inline indicator — most reconnects are
 *    brief and shouldn't alarm the dispatcher.
 *  - SSE reconnecting (>=30s): a degraded banner explaining the feed is now
 *    on a 30s poll. A 1s ticker re-evaluates the threshold.
 *  - SSE open / connecting: renders nothing.
 */
export function WireConnectionStatus() {
  const { status, reconnectingSinceMs } = useSseConnection();
  const [now, setNow] = useState(() => Date.now());

  const isReconnecting = status === 'reconnecting';

  useEffect(() => {
    if (!isReconnecting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isReconnecting]);

  if (!isReconnecting) return null;

  const outageMs = reconnectingSinceMs == null ? 0 : Math.max(0, now - reconnectingSinceMs);
  const isDegraded = outageMs > RECONNECTING_BANNER_AFTER_MS;

  if (isDegraded) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-700 dark:text-yellow-400"
      >
        <span aria-hidden>⊙</span>
        <span>Live updates paused. Refreshing every 30s.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-border bg-background px-3 py-1 text-2xs text-muted-foreground">
      <span aria-hidden>⊙</span>
      <span>reconnecting…</span>
    </div>
  );
}
