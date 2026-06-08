'use client';

import { useMemo } from 'react';
import { cn } from '@sally/ui';
import type { PaneRouterState, TowerPane } from '../../hooks/use-pane-router';
import {
  MAP_MIN,
  RAIL_WIDTH,
  SPINE_MAX,
  SPINE_MIN,
  WIRE_MAX,
  WIRE_MIN,
  type TowerLayoutState,
} from '../../hooks/use-tower-layout';
import { PeekOverlay } from './peek-overlay';
import { TowerNotSupported } from './tower-not-supported';
import { ColumnDivider } from './column-divider';
import { ColumnRail } from './column-rail';

interface PaneRouterProps {
  router: PaneRouterState;
  /** ≥1100px column sizing + visibility model. */
  layout: TowerLayoutState;
  /** The three Tower surfaces, keyed by pane. Rendered into slots per layout. */
  spine: React.ReactNode;
  map: React.ReactNode;
  wire: React.ReactNode;
  /** Floating affordances (Sally FAB) overlaid on the canvas. */
  overlays?: React.ReactNode;
}

/**
 * Tower v3 layout switch.
 *
 *  - `wide` / `tight` — 3-column. Each side column (Spine, Wire) has two
 *    orthogonal states from `useTowerLayout`:
 *      · hidden — column + divider leave the grid entirely (topbar toggle).
 *      · collapsed — column shows as a `RAIL_WIDTH` rail, no divider; the rail
 *        re-expands it (the column divider's collapse button).
 *      · expanded — full-width panel + a resizable divider.
 *    The map is `minmax(MAP_MIN, 1fr)` — it absorbs whatever the side columns
 *    don't take and never drops below `MAP_MIN`. State persists per user.
 *  - `two-pane` — the two panes from `router.pair`, side by side; wire can
 *    peek as a transient overlay (`router.peekActive`).
 *  - `unsupported` — handoff screen.
 *
 * The router never unmounts a pane it isn't showing in two-pane mode — it
 * hides it with `hidden` so query subscriptions and SSE wiring stay live.
 */
export function PaneRouter({ router, layout, spine, map, wire, overlays }: PaneRouterProps) {
  const paneNodes = useMemo<Record<TowerPane, React.ReactNode>>(() => ({ spine, map, wire }), [spine, map, wire]);

  if (router.layout === 'unsupported') {
    return (
      <main className="relative min-h-0 flex-1">
        <TowerNotSupported />
      </main>
    );
  }

  if (router.layout === 'two-pane') {
    const [left, right] = router.pair;
    return (
      <main className="relative grid min-h-0 flex-1 grid-cols-2">
        <PaneSlot pane={left} active>
          {paneNodes[left]}
        </PaneSlot>
        <PaneSlot pane={right} active={!router.peekActive}>
          {paneNodes[right]}
        </PaneSlot>
        {/* Off-pane surfaces stay mounted but hidden so their queries/SSE live on. */}
        {hiddenPanes(router.pair).map((pane) => (
          <PaneSlot key={pane} pane={pane} active={false}>
            {paneNodes[pane]}
          </PaneSlot>
        ))}
        {router.peekActive && <PeekOverlay>{wire}</PeekOverlay>}
        {overlays}
      </main>
    );
  }

  // wide + tight — resizable 3-column. The grid columns are driven entirely by
  // the layout model. Each side column contributes per its state:
  //   hidden    → nothing (column + divider gone; map reclaims the space)
  //   collapsed → a single RAIL_WIDTH track (the rail; no divider)
  //   expanded  → its width + a 1px divider track
  const spineShown = layout.spineVisible;
  const wireShown = layout.wireVisible;
  const spineCollapsed = spineShown && layout.spineCollapsed;
  const wireCollapsed = wireShown && layout.wireCollapsed;

  const spineTrack = !spineShown ? null : spineCollapsed ? `${RAIL_WIDTH}px` : `${layout.spineWidth}px 1px`;
  const wireTrack = !wireShown ? null : wireCollapsed ? `${RAIL_WIDTH}px` : `1px ${layout.wireWidth}px`;
  const gridTemplateColumns = [spineTrack, `minmax(${MAP_MIN}px, 1fr)`, wireTrack].filter(Boolean).join(' ');

  return (
    <main className="relative grid min-h-0 flex-1" style={{ gridTemplateColumns }}>
      {/* ── Spine ───────────────────────────────────────────────────────── */}
      {spineShown &&
        (spineCollapsed ? (
          <ColumnRail column="spine" label="Drivers" onExpand={() => layout.toggleCollapsed('spine')} />
        ) : (
          <>
            <div className="relative min-h-0 min-w-0 overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
              {spine}
            </div>
            <ColumnDivider
              column="spine"
              label="Drivers"
              width={layout.spineWidth}
              min={SPINE_MIN}
              max={SPINE_MAX}
              onResizeStart={(e) => layout.startResize('spine', e)}
              onNudge={(delta) => layout.nudge('spine', delta)}
              onCollapse={() => layout.toggleCollapsed('spine')}
            />
          </>
        ))}

      {/* ── Map (anchor — always present) ───────────────────────────────── */}
      <div className="relative min-h-0 min-w-0">{map}</div>

      {/* ── Wire ────────────────────────────────────────────────────────── */}
      {wireShown &&
        (wireCollapsed ? (
          <ColumnRail column="wire" label="Wire" onExpand={() => layout.toggleCollapsed('wire')} />
        ) : (
          <>
            <ColumnDivider
              column="wire"
              label="Wire"
              width={layout.wireWidth}
              min={WIRE_MIN}
              max={WIRE_MAX}
              onResizeStart={(e) => layout.startResize('wire', e)}
              onNudge={(delta) => layout.nudge('wire', delta)}
              onCollapse={() => layout.toggleCollapsed('wire')}
            />
            <div className="relative min-h-0 min-w-0 overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
              {wire}
            </div>
          </>
        ))}

      {overlays}
    </main>
  );
}

/** A single grid cell in two-pane mode. Inactive panes are kept mounted but hidden. */
function PaneSlot({ pane, active, children }: { pane: TowerPane; active: boolean; children: React.ReactNode }) {
  return (
    <div data-pane={pane} className={cn(active ? 'flex min-h-0 min-w-0 flex-col' : 'hidden')}>
      {children}
    </div>
  );
}

function hiddenPanes(pair: PaneRouterState['pair']): TowerPane[] {
  return (['spine', 'map', 'wire'] as TowerPane[]).filter((p) => p !== pair[0] && p !== pair[1]);
}
