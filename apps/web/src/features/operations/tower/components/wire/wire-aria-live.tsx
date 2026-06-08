'use client';

import { useCallback, useRef, useState } from 'react';
import { SSE_EVENTS, type TowerWireItemAddedPayload, type WireItem } from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';

const ANNOUNCE_CLEAR_MS = 3_000;

/**
 * Tower v3 — assertive ARIA-live region for critical wire alerts.
 *
 * When a critical wire item arrives over SSE its text is pushed into a
 * visually-hidden `role="status"` region so screen readers announce it once.
 * The region clears after 3s so the same string can be announced again later.
 * Mounted once on the Tower page. Never moves focus.
 */
export function WireAriaLive() {
  const [message, setMessage] = useState('');
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onWireItem = useCallback((payload: TowerWireItemAddedPayload) => {
    const item = payload as WireItem;
    if (item.severity !== 'critical') return;

    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setMessage(item.text);
    clearTimerRef.current = setTimeout(() => setMessage(''), ANNOUNCE_CLEAR_MS);
  }, []);

  useSseEvent(SSE_EVENTS.TOWER_WIRE_ITEM_ADDED, onWireItem);

  return (
    <div role="status" aria-live="assertive" className="sr-only">
      {message}
    </div>
  );
}
