import { useCallback, useEffect, useState } from 'react';
import type { LookaheadHours } from '@sally/shared-types';
import { STORAGE_KEYS } from '@/shared/constants';
import { LOOKAHEAD_DEFAULT, LOOKAHEAD_OPTIONS } from '../constants';

const VALID = new Set<LookaheadHours>(LOOKAHEAD_OPTIONS);

function readStored(): LookaheadHours {
  if (typeof window === 'undefined') return LOOKAHEAD_DEFAULT;
  const raw = window.localStorage.getItem(STORAGE_KEYS.TOWER_LOOKAHEAD);
  if (!raw) return LOOKAHEAD_DEFAULT;
  if (raw === 'shift') return 'shift';
  const parsed = Number(raw);
  if (VALID.has(parsed as LookaheadHours)) return parsed as LookaheadHours;
  return LOOKAHEAD_DEFAULT;
}

/**
 * Tower v3 lookahead window preference. Reads/writes localStorage with a
 * whitelist guard so tampered values fall back to the default.
 */
export function useLookaheadPreference() {
  const [lookaheadHours, setLookaheadHoursState] = useState<LookaheadHours>(LOOKAHEAD_DEFAULT);

  useEffect(() => {
    setLookaheadHoursState(readStored());
  }, []);

  const setLookaheadHours = useCallback((next: LookaheadHours) => {
    if (!VALID.has(next)) return;
    setLookaheadHoursState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.TOWER_LOOKAHEAD, String(next));
    }
  }, []);

  return { lookaheadHours, setLookaheadHours };
}
