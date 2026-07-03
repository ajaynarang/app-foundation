'use client';

import { useNetworkStatus } from '@appshore/web-core/shared/hooks/use-network-status';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Thin banner at top of page when network is down.
 * Shows "Reconnected" briefly when connection restores.
 * Renders nothing when online and not recently reconnected.
 *
 * Uses project color palette: critical/red for offline, accent/steel-blue for restored.
 * No green per project color rules.
 */
export function NetworkStatusBanner() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium transition-colors ${
        isOnline
          ? 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400'
          : 'bg-red-500/10 text-red-600 dark:bg-red-500/10 dark:text-red-400'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="h-3.5 w-3.5" />
          Connection restored
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          You&apos;re offline. Changes won&apos;t be saved until you reconnect.
        </>
      )}
    </div>
  );
}
