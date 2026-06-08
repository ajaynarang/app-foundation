'use client';

import { createContext, useContext } from 'react';

export type SseConnectionStatus = 'connecting' | 'open' | 'reconnecting';

export interface SseConnectionState {
  status: SseConnectionStatus;
  /** Wall-clock ms when the connection dropped; null while open/connecting. */
  reconnectingSinceMs: number | null;
}

/**
 * Default state for callers used outside <SseProvider> (SSR, tests, isolated
 * stories). Treated as `open` so reconnect UI never flashes when there is
 * simply no provider — the same no-op-safe contract as `useSseEvent`.
 */
const DEFAULT_STATE: SseConnectionState = { status: 'open', reconnectingSinceMs: null };

export const SseConnectionContext = createContext<SseConnectionState>(DEFAULT_STATE);

/**
 * Read the live EventSource connection state owned by <SseProvider>.
 *
 * No-op-safe: outside the provider it returns a stable `open` default so
 * consumers (reconnect banners, degraded indicators) never crash.
 */
export function useSseConnection(): SseConnectionState {
  return useContext(SseConnectionContext);
}
