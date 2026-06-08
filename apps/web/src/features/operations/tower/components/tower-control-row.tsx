'use client';

import { Search } from 'lucide-react';
import type { LookaheadHours } from '@sally/shared-types';
import { Input } from '@sally/ui/components/ui/input';
import { SegmentedControl, type SegmentedOption } from '@/shared/components/page-chrome';
import { RISK_FILTERS, type RiskFilter } from '../constants';
import { LookaheadToggle } from './tower-spine/lookahead-toggle';
import { RibbonLegend } from './tower-spine/ribbon-legend';
import { SpineViewToggle, type SpineView } from './tower-spine/spine-view-toggle';

interface TowerControlRowProps {
  /** Which spine view is showing — the `L` hotkey flips it. */
  view: SpineView;
  onViewChange: (next: SpineView) => void;
  lookaheadHours: LookaheadHours;
  onLookaheadChange: (next: LookaheadHours) => void;
  /** Canvas-wide risk filter — scopes both the spine list and the map. */
  riskFilter: RiskFilter;
  onRiskFilterChange: (next: RiskFilter) => void;
  /** Spine search term, shared across both views (the placeholder is contextual). */
  search: string;
  onSearchChange: (next: string) => void;
}

const RISK_OPTIONS: SegmentedOption<RiskFilter>[] = RISK_FILTERS.map((f) => ({ value: f.value, label: f.label }));

/**
 * Tower's canvas-wide control row, between the topbar and the three panes. A
 * single strip whose controls scope the whole workspace:
 *  - left    — Drivers · Loads view toggle
 *  - then    — the one canvas filter, All · At-risk · Critical (drives the spine
 *              list AND the map), then the spine search
 *  - right   — lookahead window
 *  - trailing — the ribbon legend (a "?" key, Drivers view only — it explains the
 *              driver-card timeline). It sits at the trailing edge so toggling
 *              views never reflows the row: the flexible search input absorbs the
 *              width change.
 *
 * Risk is the only triage filter on Tower — the spine groups by it, the map
 * colors by it — so it lives here once, not as a pill floating on the map. All
 * toggles use the canonical `SegmentedControl` for theme-correct, consistent
 * styling. See sally-frontend-patterns §15.4 (Page Chrome → canvas opt-out).
 */
export function TowerControlRow({
  view,
  onViewChange,
  lookaheadHours,
  onLookaheadChange,
  riskFilter,
  onRiskFilterChange,
  search,
  onSearchChange,
}: TowerControlRowProps) {
  const searchPlaceholder = view === 'drivers' ? 'Search driver, truck, or load #' : 'Search load, customer, or driver';
  const searchLabel = view === 'drivers' ? 'Search drivers' : 'Search active loads';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background px-4 py-2">
      <SpineViewToggle value={view} onChange={onViewChange} />

      <SegmentedControl options={RISK_OPTIONS} value={riskFilter} onChange={onRiskFilterChange} label="Risk filter" />

      <div className="relative min-w-[12rem] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="h-8 pl-8 text-xs"
        />
      </div>

      <LookaheadToggle value={lookaheadHours} onChange={onLookaheadChange} />

      {/* Trailing edge: a conditional element here never reflows the row — the
          flexible search input to its left absorbs the width change. */}
      {view === 'drivers' && <RibbonLegend />}
    </div>
  );
}
