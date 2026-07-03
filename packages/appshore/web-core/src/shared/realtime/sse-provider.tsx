'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SSE_EVENTS, type SseEventType, getSsePayloadSchema } from '@app/shared-types';
import { useSession } from '@appshore/web-core/auth/session-bridge';
import { captureError } from '../lib/sentry';
import { SseBus } from './sse-bus';
import { SseBusContext } from './sse-context';
import { SseConnectionContext, type SseConnectionState } from './sse-connection-context';
import { SSE_INVALIDATION_MAP } from './invalidation-map';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const RECONNECT_DELAY = 5_000;

interface SseProviderProps {
  children: React.ReactNode;
}

/**
 * Owns the single EventSource connection for the app and exposes a typed
 * SseBus via React context. For each incoming event:
 *   1. Parse the JSON payload.
 *   2. Validate it against the per-event Zod schema (cacheOnlyPayloadSchema
 *      for events that don't need strict shapes). On parse failure, log and
 *      drop — never crash the connection.
 *   3. Invalidate the query keys mapped to this event in
 *      SSE_INVALIDATION_MAP.
 *   4. Hand off to bus subscribers (per-feature stream hooks).
 *
 * Reconnect uses a fixed 5s delay on `onerror`. Heartbeat is a no-op.
 *
 * Connection state is published on a second context (SseConnectionContext)
 * so reconnect-aware UI can degrade gracefully without touching the bus.
 */
export function SseProvider({ children }: SseProviderProps) {
  const bus = useMemo(() => new SseBus(), []);
  const queryClient = useQueryClient();
  const { accessToken, isAuthenticated } = useSession();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [connection, setConnection] = useState<SseConnectionState>({
    status: 'connecting',
    reconnectingSinceMs: null,
  });

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const connect = () => {
      eventSourceRef.current?.close();

      const url = `${API_BASE_URL}/sse/stream?token=${encodeURIComponent(accessToken)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnection({ status: 'open', reconnectingSinceMs: null });
      };

      const allEventTypes = Object.values(SSE_EVENTS) as SseEventType[];
      for (const type of allEventTypes) {
        es.addEventListener(type, (e) => {
          // Step 1: parse JSON
          let raw: unknown = {};
          try {
            raw = JSON.parse((e as MessageEvent).data);
          } catch (parseError) {
            // Non-fatal — drop this event, keep the connection alive.
            captureError(parseError, { source: 'SseProvider.parseJson', eventType: type });
            return;
          }

          // Step 2: validate against the event's schema
          const schema = getSsePayloadSchema(type);
          const result = schema.safeParse(raw);
          if (!result.success) {
            // Non-fatal — drop this event, keep the connection alive.
            captureError(result.error, {
              source: 'SseProvider.validatePayload',
              eventType: type,
            });
            return;
          }

          // Step 3: cache invalidation
          const keys = SSE_INVALIDATION_MAP[type];
          if (keys) {
            for (const key of keys) {
              queryClient.invalidateQueries({ queryKey: key });
            }
          }

          // Step 4: hand off to bus subscribers
          bus.emit(type, result.data as never);
        });
      }

      es.onerror = () => {
        es.close();
        // Stamp the drop time once — keep the original timestamp across
        // repeated reconnect attempts so the degraded-banner threshold
        // measures the full outage, not the last retry.
        setConnection((prev) =>
          prev.status === 'reconnecting' ? prev : { status: 'reconnecting', reconnectingSinceMs: Date.now() },
        );
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
      };
    };

    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [accessToken, isAuthenticated, bus, queryClient]);

  return (
    <SseBusContext.Provider value={bus}>
      <SseConnectionContext.Provider value={connection}>{children}</SseConnectionContext.Provider>
    </SseBusContext.Provider>
  );
}
