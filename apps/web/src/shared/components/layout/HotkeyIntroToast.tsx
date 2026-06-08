'use client';

import { useEffect } from 'react';
import { toast } from '@app/ui';
import { STORAGE_KEYS } from '@/shared/constants';

const TOAST_DELAY_MS = 1500;

/**
 * Fires a one-time toast announcing the new keyboard shortcuts,
 * then marks it shown in localStorage. Renders nothing.
 */
export function HotkeyIntroToast() {
  useEffect(() => {
    let alreadyShown = false;
    try {
      alreadyShown = localStorage.getItem(STORAGE_KEYS.HOTKEY_INTRO_SHOWN) === '1';
    } catch {
      // localStorage unavailable — don't spam on every mount
      alreadyShown = true;
    }
    if (alreadyShown) return;

    const timer = setTimeout(() => {
      toast('New shortcuts', {
        description: 'Press ⌘K to search, G then H to jump Home.',
        duration: 8000,
      });
      try {
        localStorage.setItem(STORAGE_KEYS.HOTKEY_INTRO_SHOWN, '1');
      } catch {
        // ignore
      }
    }, TOAST_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
