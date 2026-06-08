'use client';

import type { LookaheadHours } from '@sally/shared-types';
import type { RiskFilter } from '../../constants';
import { DriversView } from './drivers-view';
import type { SpineView } from './spine-view-toggle';
import { ActiveLoadsView } from './active-loads/active-loads-view';

interface TowerSpineProps {
  lookaheadHours: LookaheadHours;
  /** Which spine view is showing — controlled by the page so `L` can flip it. */
  view: SpineView;
  /** Canvas-wide risk filter + search — owned by the page's control row. */
  riskFilter: RiskFilter;
  search: string;
}

/**
 * Tower v3 spine column. A two-view workspace:
 *  - Drivers      — the driver-grouped swimlane (Needs you / Rolling).
 *  - Active loads — every active load as a filterable, searchable list.
 *
 * The spine carries no chrome of its own: the view toggle, lookahead window,
 * risk filter, and search all live in the canvas-wide control row (see the
 * Tower page). This column is purely the active view's body, filtered by the
 * canvas risk filter. The `L` hotkey flips the view from the page.
 */
export function TowerSpine({ lookaheadHours, view, riskFilter, search }: TowerSpineProps) {
  return (
    <section aria-label="Tower spine" className="flex h-full min-h-0 flex-col border-r border-border bg-background">
      {view === 'drivers' ? (
        <DriversView lookaheadHours={lookaheadHours} riskFilter={riskFilter} search={search} />
      ) : (
        <ActiveLoadsView lookaheadHours={lookaheadHours} riskFilter={riskFilter} search={search} />
      )}
    </section>
  );
}
