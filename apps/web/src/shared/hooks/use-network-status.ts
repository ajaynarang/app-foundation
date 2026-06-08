'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Tracks browser online/offline state.
 * Returns { isOnline, wasOffline } — wasOffline stays true for 3s after
 * reconnection so the banner can show a "Reconnected" message briefly.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    // Initialize from browser state
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Clear "reconnected" state after 3 seconds
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setWasOffline(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(timeoutRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}
