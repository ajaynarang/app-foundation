/**
 * Tower v3 — backend tuning constants.
 *
 * Risk-score weights and thresholds live here so they can be calibrated
 * empirically without touching service code. Launch values use a simplified
 * formula (HOS thinness + ETA slack thinness only) — weather, customer
 * fragility, and traffic are deferred until we have data to weight them.
 */

export const RISK_BANDS = ['on-track', 'at-risk', 'critical'] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const AT_RISK_THRESHOLD = 60;
export const CRITICAL_THRESHOLD = 80;
export const EXIT_AT_RISK_AT = 55;
export const EXIT_CRITICAL_AT = 75;

export const RISK_WEIGHT_HOS = 60;
export const RISK_WEIGHT_ETA_SLACK = 40;

export const LOOKAHEAD_DEFAULT_HOURS = 4;
export const LOOKAHEAD_MIN_HOURS = 1;
export const LOOKAHEAD_MAX_HOURS = 12;

export const WIRE_BACKFILL_DEFAULT_LIMIT = 50;
export const WIRE_BACKFILL_MAX_LIMIT = 200;

export const STALE_MAP_THRESHOLD_MS = 300_000;
