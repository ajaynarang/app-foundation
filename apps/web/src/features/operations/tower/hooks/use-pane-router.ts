'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';

/**
 * Tower v3 — responsive pane router.
 *
 * Drives four layouts off the window width:
 *  - `wide`        ≥1440px — full 3-column (spine 320 / map / wire 360)
 *  - `tight`       1100–1439px — 3-column with slimmer side rails
 *  - `two-pane`    900–1099px — adaptive 2-pane state machine
 *  - `unsupported` <900px — render <TowerNotSupported />
 *
 * The 2-pane machine pairs two of {spine, map, wire}. `1`/`2`/`3` swap the
 * focused pane; holding `3` peeks the wire as a transient overlay.
 */

export type TowerPane = 'spine' | 'map' | 'wire';
export type TowerLayout = 'wide' | 'tight' | 'two-pane' | 'unsupported';

/** [left, right] — the two panes visible at <1100px. */
export type PanePair = readonly [TowerPane, TowerPane];

const UNSUPPORTED_MAX = 900;
const TWO_PANE_MAX = 1100;
const TIGHT_MAX = 1440;

const DEFAULT_PAIR: PanePair = ['spine', 'map'];
const ALL_PANES: TowerPane[] = ['spine', 'map', 'wire'];

export interface PaneRouterState {
  layout: TowerLayout;
  /** The two panes shown side by side at <1100px. */
  pair: PanePair;
  /** The pane treated as primary/focused — the left of the pair. */
  focusedPane: TowerPane;
  /** Whether the wire is currently peeking as a transient overlay. */
  peekActive: boolean;
  /** Swap a pane into focus (tap 1/2/3). */
  swap: (pane: TowerPane) => void;
  /** Start a transient wire peek over the right pane (hold 3). */
  peekStart: () => void;
  /** End the transient wire peek. */
  peekEnd: () => void;
}

function classifyLayout(width: number): TowerLayout {
  if (width < UNSUPPORTED_MAX) return 'unsupported';
  if (width < TWO_PANE_MAX) return 'two-pane';
  if (width < TIGHT_MAX) return 'tight';
  return 'wide';
}

function isPane(value: unknown): value is TowerPane {
  return value === 'spine' || value === 'map' || value === 'wire';
}

/** Parse a persisted `[left, right]` pair, rejecting anything malformed. */
function readStoredPair(): PanePair {
  if (typeof window === 'undefined') return DEFAULT_PAIR;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.TOWER_PANE_PREFERENCE);
    if (!raw) return DEFAULT_PAIR;
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      isPane(parsed[0]) &&
      isPane(parsed[1]) &&
      parsed[0] !== parsed[1]
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // Corrupt value — fall through to the default pair.
  }
  return DEFAULT_PAIR;
}

function persistPair(pair: PanePair) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.TOWER_PANE_PREFERENCE, JSON.stringify(pair));
  } catch {
    // Storage unavailable (private mode / quota) — keep the in-memory pair.
  }
}

/**
 * Move `pane` into focus. If it's already in the pair, swap it to the left.
 * Otherwise it replaces the right pane (the left/focused pane is preserved).
 */
function focusPane(pair: PanePair, pane: TowerPane): PanePair {
  const [left, right] = pair;
  if (pane === left) return pair;
  if (pane === right) return [right, left];
  return [left, pane];
}

export function usePaneRouter(): PaneRouterState {
  const [width, setWidth] = useState<number>(() => (typeof window === 'undefined' ? TIGHT_MAX : window.innerWidth));
  const [pair, setPair] = useState<PanePair>(DEFAULT_PAIR);
  const [peekActive, setPeekActive] = useState(false);

  // Hydrate the persisted pair after mount — SSR renders the default.
  useEffect(() => {
    setPair(readStoredPair());
  }, []);

  // Track the window width with a debounced resize listener.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener('resize', onResize);
    setWidth(window.innerWidth);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const layout = useMemo(() => classifyLayout(width), [width]);

  const swap = useCallback((pane: TowerPane) => {
    setPair((current) => {
      const next = focusPane(current, pane);
      if (next !== current) persistPair(next);
      return next;
    });
  }, []);

  const peekStart = useCallback(() => setPeekActive(true), []);
  const peekEnd = useCallback(() => setPeekActive(false), []);

  return {
    layout,
    pair,
    focusedPane: pair[0],
    peekActive,
    swap,
    peekStart,
    peekEnd,
  };
}

export { ALL_PANES, DEFAULT_PAIR };
