'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePaletteStore } from '@/shared/components/command-palette/CommandPalette';

const CHORD_WINDOW_MS = 1000;
const HOME_HREF = '/settings';

/**
 * Global keyboard shortcuts for the authenticated app shell.
 *
 * - ⌘K / Ctrl+K  → open command palette
 * - g then h     → navigate to Home (Gmail-style "go to" chord)
 *
 * Input / textarea / contenteditable elements are skipped so typing
 * "hello" doesn't trip the chord.
 */
export function useAppHotkeys() {
  const router = useRouter();
  const { toggle: togglePalette, setOpen: setPaletteOpen } = usePaletteStore();

  useEffect(() => {
    let chordActive = false;
    let chordTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearChord = () => {
      chordActive = false;
      if (chordTimeout) {
        clearTimeout(chordTimeout);
        chordTimeout = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — command palette (always active, even in inputs)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        togglePalette();
        clearChord();
        return;
      }

      // Chord shortcuts skip when user is typing
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true;
      if (isTyping) return;

      // Ignore chord when modifier keys are involved
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Start chord on "g"
      if (e.key === 'g' && !chordActive) {
        chordActive = true;
        chordTimeout = setTimeout(clearChord, CHORD_WINDOW_MS);
        return;
      }

      // Resolve chord on second key
      if (chordActive) {
        if (e.key === 'h') {
          e.preventDefault();
          setPaletteOpen(false);
          router.push(HOME_HREF);
        }
        clearChord();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (chordTimeout) clearTimeout(chordTimeout);
    };
  }, [router, togglePalette, setPaletteOpen]);
}
