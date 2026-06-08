'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';

/**
 * Tower v3 — ≥1100px column layout model.
 *
 * Owns two ORTHOGONAL states for each of the Spine and Wire side columns:
 *
 *  - `*Visible` — hide/show. Driven by the IDE-style topbar toggle. A hidden
 *    column AND its divider leave the grid template entirely; the map's
 *    `minmax(MAP_MIN, 1fr)` absorbs the full remainder.
 *  - `*Collapsed` — collapse to a thin rail. Driven by the column divider
 *    button. A collapsed-but-visible column still occupies the grid as a
 *    narrow `RAIL_WIDTH` rail (a labelled strip the dispatcher clicks to
 *    re-expand) — it is NOT removed. Expanded, it takes its full `*Width`.
 *
 * Hide and collapse are distinct affordances: hide = "I don't need this now",
 * collapse = "keep it as a peek rail". `*Width` is the expanded width and is
 * preserved across a collapse so re-expanding restores the prior size.
 *
 * The map is never sized directly and is never hideable — it's the anchor.
 *
 * State is persisted per user in localStorage and rehydrated after mount
 * (SSR renders the defaults to avoid a hydration mismatch).
 */

export const SPINE_MIN = 260;
export const SPINE_MAX = 420;
export const SPINE_DEFAULT = 320;

export const WIRE_MIN = 300;
export const WIRE_MAX = 460;
export const WIRE_DEFAULT = 360;

/** The map never collapses below this — its grid `minmax` floor. */
export const MAP_MIN = 360;

/** Width of a collapsed column's rail — a slim labelled strip. */
export const RAIL_WIDTH = 40;

export type TowerColumn = 'spine' | 'wire';

interface PersistedLayout {
  spineWidth: number;
  wireWidth: number;
  spineVisible: boolean;
  wireVisible: boolean;
  spineCollapsed: boolean;
  wireCollapsed: boolean;
}

export interface TowerLayoutState {
  spineWidth: number;
  wireWidth: number;
  spineVisible: boolean;
  wireVisible: boolean;
  spineCollapsed: boolean;
  wireCollapsed: boolean;
  /** Whether a side column is currently shown in the grid. */
  isVisible: (column: TowerColumn) => boolean;
  /** Whether a side column is collapsed to its rail. */
  isCollapsed: (column: TowerColumn) => boolean;
  /** Begin a pointer drag on the divider next to `column`. */
  startResize: (column: TowerColumn, event: React.PointerEvent) => void;
  /** Nudge a column width by `delta` px (keyboard arrow support on dividers). */
  nudge: (column: TowerColumn, delta: number) => void;
  /** Show/hide a side column (removes its column + divider from the grid). */
  toggleVisibility: (column: TowerColumn) => void;
  /** Collapse/expand a side column between its rail and its full width. */
  toggleCollapsed: (column: TowerColumn) => void;
  /** True while a divider drag is in progress (used to suppress transitions). */
  isResizing: boolean;
}

const DEFAULT_LAYOUT: PersistedLayout = {
  spineWidth: SPINE_DEFAULT,
  wireWidth: WIRE_DEFAULT,
  spineVisible: true,
  wireVisible: true,
  spineCollapsed: false,
  wireCollapsed: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampColumn(column: TowerColumn, width: number): number {
  return column === 'spine' ? clamp(width, SPINE_MIN, SPINE_MAX) : clamp(width, WIRE_MIN, WIRE_MAX);
}

function readStoredLayout(): PersistedLayout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.TOWER_LAYOUT);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Partial<PersistedLayout>;
      return {
        spineWidth: clampColumn('spine', Number(p.spineWidth) || SPINE_DEFAULT),
        wireWidth: clampColumn('wire', Number(p.wireWidth) || WIRE_DEFAULT),
        // Default to visible / expanded. Both flags default true / false so a
        // partial or legacy persisted blob rehydrates to a sane layout.
        spineVisible: p.spineVisible !== false,
        wireVisible: p.wireVisible !== false,
        spineCollapsed: p.spineCollapsed === true,
        wireCollapsed: p.wireCollapsed === true,
      };
    }
  } catch {
    // Corrupt value — fall through to defaults.
  }
  return DEFAULT_LAYOUT;
}

function persistLayout(layout: PersistedLayout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.TOWER_LAYOUT, JSON.stringify(layout));
  } catch {
    // Storage unavailable (private mode / quota) — keep the in-memory layout.
  }
}

export function useTowerLayout(): TowerLayoutState {
  const [layout, setLayout] = useState<PersistedLayout>(DEFAULT_LAYOUT);
  const [isResizing, setIsResizing] = useState(false);

  // A live drag tracks its origin in a ref — no re-render per pointermove.
  const dragRef = useRef<{ column: TowerColumn; startX: number; startWidth: number } | null>(null);

  // Rehydrate the persisted layout after mount (SSR renders defaults).
  useEffect(() => {
    setLayout(readStoredLayout());
  }, []);

  const commit = useCallback((next: PersistedLayout) => {
    setLayout(next);
    persistLayout(next);
  }, []);

  const startResize = useCallback(
    (column: TowerColumn, event: React.PointerEvent) => {
      event.preventDefault();
      const startWidth = column === 'spine' ? layout.spineWidth : layout.wireWidth;
      dragRef.current = { column, startX: event.clientX, startWidth };
      setIsResizing(true);

      // Capture the pointer on the divider element so the drag keeps tracking
      // 1:1 even when the cursor crosses the Mapbox canvas (which otherwise
      // swallows pointermove/pointerup and drops the drag mid-gesture).
      const handle = event.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture unsupported — fall back to window listeners below.
      }

      const onMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        // Spine grows when the divider moves right; wire grows moving left.
        const direction = drag.column === 'spine' ? 1 : -1;
        const raw = drag.startWidth + (e.clientX - drag.startX) * direction;
        const width = clampColumn(drag.column, raw);
        setLayout((prev) => (drag.column === 'spine' ? { ...prev, spineWidth: width } : { ...prev, wireWidth: width }));
      };
      const onUp = () => {
        dragRef.current = null;
        setIsResizing(false);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch {
          // No capture to release — safe to ignore.
        }
        setLayout((prev) => {
          persistLayout(prev);
          return prev;
        });
      };
      // With pointer capture, every move/up event retargets to the handle —
      // listening on it (not window) keeps the gesture intact over the map.
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    },
    [layout.spineWidth, layout.wireWidth],
  );

  const nudge = useCallback((column: TowerColumn, delta: number) => {
    setLayout((prev) => {
      const next =
        column === 'spine'
          ? { ...prev, spineWidth: clampColumn('spine', prev.spineWidth + delta) }
          : { ...prev, wireWidth: clampColumn('wire', prev.wireWidth + delta) };
      persistLayout(next);
      return next;
    });
  }, []);

  const toggleVisibility = useCallback(
    (column: TowerColumn) => {
      const next =
        column === 'spine'
          ? { ...layout, spineVisible: !layout.spineVisible }
          : { ...layout, wireVisible: !layout.wireVisible };
      commit(next);
    },
    [layout, commit],
  );

  const toggleCollapsed = useCallback(
    (column: TowerColumn) => {
      const next =
        column === 'spine'
          ? { ...layout, spineCollapsed: !layout.spineCollapsed }
          : { ...layout, wireCollapsed: !layout.wireCollapsed };
      commit(next);
    },
    [layout, commit],
  );

  const isVisible = useCallback(
    (column: TowerColumn) => (column === 'spine' ? layout.spineVisible : layout.wireVisible),
    [layout],
  );

  const isCollapsed = useCallback(
    (column: TowerColumn) => (column === 'spine' ? layout.spineCollapsed : layout.wireCollapsed),
    [layout],
  );

  return useMemo(
    () => ({
      spineWidth: layout.spineWidth,
      wireWidth: layout.wireWidth,
      spineVisible: layout.spineVisible,
      wireVisible: layout.wireVisible,
      spineCollapsed: layout.spineCollapsed,
      wireCollapsed: layout.wireCollapsed,
      isVisible,
      isCollapsed,
      startResize,
      nudge,
      toggleVisibility,
      toggleCollapsed,
      isResizing,
    }),
    [layout, isVisible, isCollapsed, startResize, nudge, toggleVisibility, toggleCollapsed, isResizing],
  );
}
