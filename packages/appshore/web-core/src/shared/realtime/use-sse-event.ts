'use client';

import { useContext, useEffect, useRef } from 'react';
import type { SseEventType, SsePayloadFor } from '@app/shared-types';
import { SseBusContext } from './sse-context';

/**
 * Subscribe to a typed SSE event for the lifetime of the component.
 *
 * The handler is captured in a ref so consumers don't have to memoize —
 * the bus always calls the latest handler. Subscribes on mount,
 * unsubscribes on unmount.
 *
 * Must be used inside <SseProvider>. Outside the provider it is a no-op
 * (handler never fires) — that lets routes/layouts call it
 * unconditionally without worrying about provider placement.
 */
export function useSseEvent<T extends SseEventType>(eventType: T, handler: (payload: SsePayloadFor<T>) => void): void {
  const bus = useContext(SseBusContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!bus) return;
    return bus.subscribe(eventType, (payload) => handlerRef.current(payload));
  }, [bus, eventType]);
}
