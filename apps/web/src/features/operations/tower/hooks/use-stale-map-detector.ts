import { useEffect, useState } from 'react';
import { STALE_MAP_THRESHOLD_MS } from '../constants';

/**
 * Tower v3 — flips to stale when the map's last update is older than the
 * configured threshold. Re-evaluates every second so the banner appears at
 * the right moment without polling the backend.
 */
export function useStaleMapDetector(lastUpdatedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!lastUpdatedAt) {
    return { isStale: false, ageMs: 0 };
  }

  const parsed = new Date(lastUpdatedAt).getTime();
  if (Number.isNaN(parsed)) {
    return { isStale: false, ageMs: 0 };
  }

  const ageMs = Math.max(0, now - parsed);
  return { isStale: ageMs > STALE_MAP_THRESHOLD_MS, ageMs };
}
