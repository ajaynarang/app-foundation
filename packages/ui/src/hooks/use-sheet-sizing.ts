'use client';

import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SHEET_SIZE_MODE_OPTIONS = ['side-panel', 'half', 'full'] as const;
export type SheetSizeMode = (typeof SHEET_SIZE_MODE_OPTIONS)[number];

// Must stay in sync with STORAGE_KEYS.SHEET_SIZES in @appshore/web-core — @app/ui
// cannot import web-core (dependency direction), so the literal lives here.
const SHEET_SIZES_STORAGE_KEY = 'app:sheet-sizes';

interface SheetSizeState {
  sizes: Record<string, SheetSizeMode>;
  setSize: (entityType: string, size: SheetSizeMode) => void;
}

export const useSheetSizeStore = create<SheetSizeState>()(
  persist(
    (set) => ({
      sizes: {},
      setSize: (entityType: string, size: SheetSizeMode) =>
        set((state) => ({
          sizes: { ...state.sizes, [entityType]: size },
        })),
    }),
    {
      name: SHEET_SIZES_STORAGE_KEY,
    },
  ),
);

const LG_BREAKPOINT = 1024;

/** Convert sizing mode to pixel width for the resizable sheet system */
export function sizeModeToPixels(mode: SheetSizeMode): number {
  switch (mode) {
    case 'side-panel':
      return 672; // matches sm:max-w-2xl (42rem)
    case 'half':
      return typeof window !== 'undefined' ? Math.floor(window.innerWidth / 2) : 672;
    case 'full':
      return typeof window !== 'undefined' ? window.innerWidth : 1440;
  }
}

/**
 * Hook for sheet sizing controls integration.
 * Returns whether to show controls and the current size mode.
 *
 * On screens < 1024px, controls are hidden.
 */
export function useSheetSizing(entityType: string) {
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsLargeScreen(e.matches);
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const storedSize = useSheetSizeStore((s) => (entityType ? (s.sizes[entityType] ?? 'side-panel') : 'side-panel'));
  const showControls = isLargeScreen && !!entityType;

  return {
    showControls,
    effectiveSize: storedSize,
  };
}
