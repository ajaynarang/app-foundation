import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';

/** localStorage value written when the radar ledge is collapsed. */
const COLLAPSED_VALUE = '1';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEYS.TOWER_RADAR_COLLAPSED) === COLLAPSED_VALUE;
}

/**
 * Tower v3 map radar ledge collapsed/expanded preference.
 *
 * Defaults to expanded — the "next 4 hours" forecast is the point of the
 * ledge; collapse is the escape hatch for reclaiming map height. SSR renders
 * the default and the persisted value is rehydrated after mount to avoid a
 * hydration mismatch (same pattern as `useLookaheadPreference`).
 */
export function useRadarCollapsed() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    setIsCollapsed(readStored());
  }, []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        if (next) {
          window.localStorage.setItem(STORAGE_KEYS.TOWER_RADAR_COLLAPSED, COLLAPSED_VALUE);
        } else {
          window.localStorage.removeItem(STORAGE_KEYS.TOWER_RADAR_COLLAPSED);
        }
      }
      return next;
    });
  }, []);

  return { isCollapsed, toggleCollapsed };
}
