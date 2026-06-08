import type { LookaheadHours, RiskBand } from '@sally/shared-types';

export const LOOKAHEAD_OPTIONS: LookaheadHours[] = [2, 4, 8, 'shift'];
export const LOOKAHEAD_DEFAULT: LookaheadHours = 4;

export const AT_RISK_THRESHOLD = 60;
export const CRITICAL_THRESHOLD = 80;

export const RISK_BAND_LABELS: Record<RiskBand, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  critical: 'Critical',
};

export const RISK_BAND_TOKENS: Record<RiskBand, string> = {
  'on-track': 'text-muted-foreground',
  'at-risk': 'text-yellow-600 dark:text-yellow-400',
  critical: 'text-red-600 dark:text-red-400',
};

export const RISK_BAND_DOT_TOKENS: Record<RiskBand, string> = {
  'on-track': 'bg-muted-foreground/50',
  'at-risk': 'bg-yellow-500',
  critical: 'bg-red-500',
};

export const STALE_MAP_THRESHOLD_MS = 300_000;
export const RECONNECTING_BANNER_AFTER_MS = 30_000;

export const WIRE_COALESCE_WINDOW_MS = 10_000;
export const WIRE_COALESCE_THRESHOLD = 3;

export const HOTKEYS = {
  SALLY: 's',
  SPINE_LOADS: 'l',
  FOCUS_SPINE: '1',
  FOCUS_MAP: '2',
  FOCUS_WIRE: '3',
  WIRE_DRAWER: 'w',
  HELP: '?',
} as const;

// ── Risk filter (canvas-wide) ───────────────────────────────────────────────
//
// Tower's single triage filter. Risk is the organizing principle of the whole
// canvas — the spine groups by it, the map colors by it, the wire surfaces it —
// so ONE risk filter in the control row scopes both the spine list and the map.
// 'all' shows everything; 'at-risk' is any non-on-track band; 'critical' is the
// critical band only.

export const RISK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'at-risk', label: 'At-risk' },
  { value: 'critical', label: 'Critical' },
] as const;

export type RiskFilter = (typeof RISK_FILTERS)[number]['value'];

/** True when a risk band passes the active risk filter. */
export function matchesRiskFilter(band: RiskBand, filter: RiskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'critical') return band === 'critical';
  return band !== 'on-track'; // at-risk
}

// Left-edge row tint by risk band — pairs with RISK_BAND_DOT_TOKENS.
export const RISK_BAND_EDGE_TOKENS: Record<RiskBand, string> = {
  'on-track': 'border-l-transparent',
  'at-risk': 'border-l-yellow-500',
  critical: 'border-l-red-500',
};

// Alert snooze duration for the wire "Mute 1h" action.
export const WIRE_MUTE_DURATION_MINUTES = 60;

// ── Tower map ───────────────────────────────────────────────────────────────

/**
 * Steel-blue used for the selected truck's load-route line and its legend
 * swatch. Deliberately not a risk color — it must not compete with the
 * red/yellow truck markers for the dispatcher's attention.
 */
export const LOAD_ROUTE_COLOR = '#7c8aff';
