/**
 * SQ-112 — deterministic stop-location backfill.
 *
 * Some broker ratecons print a stop as a single combined line with no street
 * address (`Fair Lawn, NJ US 07410`). The conservative extraction prompt
 * (SQ-107) leaves `city`/`state` empty rather than splitting it, so the draft
 * trips the DRAFT→PENDING validator. This normalizer recovers the discrete
 * `city` / `state` / `zip_code` from whichever field the combined string landed
 * in — WITHOUT calling the model and WITHOUT inventing data.
 *
 * Invariants:
 *   - Backfill-only. Never overwrites a non-empty `city`/`state`/`zip_code`.
 *   - Only splits a string already present on the stop (city → address →
 *     facility_name, in that order of trust).
 *   - State must be a real US/territory code (US_STATE_CODES) or no split.
 *
 * All patterns live in ratecon-address.constants.ts — no inline regex here.
 */

import {
  CITY_STATE_ZIP_ONLY_PATTERN,
  CITY_STATE_ZIP_WITH_STREET_PATTERN,
  US_STATE_CODES,
} from './ratecon-address.constants';

/** The stop fields this normalizer reads and may backfill. */
export interface NormalizableStop {
  facility_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

interface ParsedLocation {
  city: string;
  state: string;
  zip: string;
}

function isBlank(value: string | undefined | null): boolean {
  return value == null || value.trim().length === 0;
}

/**
 * Try to split a combined location string into city/state/zip. Returns null if
 * the string is not a recognized "City, ST [US] ZIP" (or street-prefixed
 * variant) or the state token is not a real US/territory code.
 */
export function parseCombinedLocation(raw: string | undefined | null): ParsedLocation | null {
  if (isBlank(raw)) return null;
  const value = raw.trim();

  const match = CITY_STATE_ZIP_ONLY_PATTERN.exec(value) ?? CITY_STATE_ZIP_WITH_STREET_PATTERN.exec(value);
  if (!match) return null;

  const city = match[1].trim();
  const state = match[2].toUpperCase();
  const zip = match[3].trim();

  if (!US_STATE_CODES.has(state)) return null;
  if (city.length === 0) return null;

  return { city, state, zip };
}

/**
 * Backfill empty city/state/zip on a single stop from its combined location
 * fields. Returns a NEW stop object (does not mutate the input) plus whether
 * anything changed. Tries the most-trusted source first: an over-stuffed
 * `city` field, then `address`, then `facility_name`.
 */
export function normalizeStopLocation<T extends NormalizableStop>(stop: T): { stop: T; changed: boolean } {
  const cityHoldsCombined = parseCombinedLocation(stop.city) != null;
  const needsState = isBlank(stop.state);
  const needsZip = isBlank(stop.zip_code);
  // The `city` field needs work if it's blank OR if it actually holds a whole
  // "City, ST US ZIP" line (the model's most common misfile for this format —
  // it parses cleanly but the discrete city is buried in the combined string).
  const needsCity = isBlank(stop.city) || cityHoldsCombined;

  // Nothing to do — every discrete field is already a clean value.
  if (!needsCity && !needsState && !needsZip) {
    return { stop, changed: false };
  }

  // Candidate combined strings, in descending order of trust. The `city` field
  // is first: it most often holds the combined line for this broker format.
  const candidates = [stop.city, stop.address, stop.facility_name];

  for (const candidate of candidates) {
    const parsed = parseCombinedLocation(candidate);
    if (!parsed) continue;

    const next = { ...stop };
    let changed = false;

    if (needsCity) {
      next.city = parsed.city;
      changed = true;
    }
    if (needsState) {
      next.state = parsed.state;
      changed = true;
    }
    if (needsZip && parsed.zip) {
      next.zip_code = parsed.zip;
      changed = true;
    }

    if (changed) return { stop: next, changed: true };
  }

  return { stop, changed: false };
}

/**
 * Apply {@link normalizeStopLocation} across a stops array. Returns a new array
 * and the count of stops that were backfilled (for logging / metrics).
 */
export function normalizeStopLocations<T extends NormalizableStop>(
  stops: T[],
): { stops: T[]; backfilledCount: number } {
  let backfilledCount = 0;
  const normalized = stops.map((s) => {
    const result = normalizeStopLocation(s);
    if (result.changed) backfilledCount++;
    return result.stop;
  });
  return { stops: normalized, backfilledCount };
}
