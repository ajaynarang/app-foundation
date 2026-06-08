'use client';

import { useEffect, useRef } from 'react';
import { useSallyStore } from '@/features/platform/sally-ai/store';
import { HOTKEYS } from '../constants';
import type { PaneRouterState } from './use-pane-router';

/**
 * Hold-vs-tap threshold for the `3` key. A press shorter than this is a tap
 * (permanent wire swap); a longer press is a hold (transient wire peek).
 */
const PEEK_HOLD_MS = 200;

export interface TowerHotkeyHandlers {
  /** Flip the Tower spine between the Drivers and Active-loads views. */
  toggleSpineView: () => void;
  /** Open the hotkeys help sheet (`?`). */
  openHotkeysSheet: () => void;
  /** Close the hotkeys help sheet (Esc priority). */
  closeHotkeysSheet: () => void;
  /** Whether the hotkeys sheet is open. */
  isHotkeysSheetOpen: boolean;
  /** The responsive pane router — drives 1/2/3/W at narrow widths. */
  paneRouter: PaneRouterState;
}

/** True when keystrokes should be treated as text input, not hotkeys. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Tower v3 — the single global hotkey runtime for the page.
 *
 * One `keydown`/`keyup` listener pair drives every shortcut:
 *  - `S`         open the Sally launcher
 *  - `L`         flip the spine between Drivers and Active loads
 *  - `1/2/3`     swap pane focus (only at <1100px; no-op when 3-col is fixed)
 *  - `3` (hold)  peek the wire as a transient overlay (≥200ms)
 *  - `W`         open the wire pane (equivalent to tap `3`, narrow only)
 *  - `?`         open the hotkeys help sheet
 *  - `Esc`       close the topmost overlay (Sally → sheet → peek)
 *
 * Gated per Sally hotkey rules: never fires while an input is focused or a
 * modifier (Cmd/Ctrl/Alt/Meta) is held — only bare single keys.
 */
export function useTowerHotkeys(handlers: TowerHotkeyHandlers) {
  // Keep the latest handlers in a ref so the listener is bound exactly once.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Tracks an in-flight `3` keydown so keyup can decide tap vs. hold.
  const threeDownAtRef = useRef<number | null>(null);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearPeekTimer() {
      if (peekTimerRef.current) {
        clearTimeout(peekTimerRef.current);
        peekTimerRef.current = null;
      }
    }

    /** Esc closes exactly one overlay, in priority order. Returns true if it did. */
    function closeTopmostOverlay(): boolean {
      const h = handlersRef.current;
      const sally = useSallyStore.getState();
      if (sally.isExpanded) {
        // `toggleStrip` fully dismisses an open strip (isOpen + isExpanded false).
        sally.toggleStrip();
        return true;
      }
      if (h.isHotkeysSheetOpen) {
        h.closeHotkeysSheet();
        return true;
      }
      if (h.paneRouter.peekActive) {
        h.paneRouter.peekEnd();
        return true;
      }
      return false;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const h = handlersRef.current;

      if (event.key === 'Escape') {
        if (closeTopmostOverlay()) event.preventDefault();
        return;
      }

      // Gate: no modifier keys, no editable target — bare single keys only.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const isNarrow = h.paneRouter.layout === 'two-pane';

      switch (event.key.toLowerCase()) {
        case HOTKEYS.SALLY:
          event.preventDefault();
          useSallyStore.getState().expandStrip('orb');
          return;

        case HOTKEYS.SPINE_LOADS:
          event.preventDefault();
          h.toggleSpineView();
          return;

        case HOTKEYS.FOCUS_SPINE:
          if (isNarrow) {
            event.preventDefault();
            h.paneRouter.swap('spine');
          }
          return;

        case HOTKEYS.FOCUS_MAP:
          if (isNarrow) {
            event.preventDefault();
            h.paneRouter.swap('map');
          }
          return;

        case HOTKEYS.FOCUS_WIRE:
          if (isNarrow && threeDownAtRef.current == null) {
            event.preventDefault();
            // Start the hold timer — if it fires before keyup it's a peek.
            threeDownAtRef.current = Date.now();
            clearPeekTimer();
            peekTimerRef.current = setTimeout(() => {
              handlersRef.current.paneRouter.peekStart();
            }, PEEK_HOLD_MS);
          }
          return;

        case HOTKEYS.WIRE_DRAWER:
          if (isNarrow) {
            event.preventDefault();
            h.paneRouter.swap('wire');
          }
          return;

        default:
          // `?` is Shift+/ — `event.key` is already `'?'`, no modifier check.
          if (event.key === HOTKEYS.HELP) {
            event.preventDefault();
            h.openHotkeysSheet();
          }
          return;
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key !== HOTKEYS.FOCUS_WIRE) return;
      const downAt = threeDownAtRef.current;
      threeDownAtRef.current = null;
      clearPeekTimer();
      if (downAt == null) return;

      const h = handlersRef.current;
      if (h.paneRouter.peekActive) {
        // Hold released — drop the transient peek.
        h.paneRouter.peekEnd();
      } else if (Date.now() - downAt < PEEK_HOLD_MS && h.paneRouter.layout === 'two-pane') {
        // Quick tap — permanently swap the wire into the pair.
        h.paneRouter.swap('wire');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearPeekTimer();
    };
  }, []);
}
