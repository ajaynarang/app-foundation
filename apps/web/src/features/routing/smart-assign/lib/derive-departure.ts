/**
 * Where the suggested smart-route departure time came from.
 * - `DERIVED` — back-calculated from pickup appointment, deadhead, and buffers.
 * - `FALLBACK_NO_LOCATION` — pickup known but driver location missing; uses `pickup − 1h`.
 * - `FALLBACK_PAST_APPT` — pickup missing or already past; uses `now + 1h`.
 * - `NOW_PLUS_HOUR` — caller had no useful input at all.
 */
export type DepartureSource = 'DERIVED' | 'FALLBACK_NO_LOCATION' | 'FALLBACK_PAST_APPT' | 'NOW_PLUS_HOUR';

export interface DepartureSuggestion {
  /** ISO-8601 (UTC). Callers convert to the appropriate local format for the input control. */
  isoTime: string;
  source: DepartureSource;
  /** Human-readable explanation suitable to show inline under the input. */
  note?: string;
  /** Estimated deadhead in minutes. 0 if driver is at pickup or location is unknown without a fallback. */
  deadheadMinutes: number;
}

export interface DeriveDefaultDepartureInput {
  firstPickupApptStart?: Date | null;
  driverDistanceMilesFromPickup?: number | null;
  /** Injectable for tests; defaults to `new Date()`. */
  now?: Date;
}

const AVG_FLEET_SPEED_MPH = 50;
const PRE_TRIP_BUFFER_HOURS = 0.25;
const SAFETY_BUFFER_HOURS = 0.25;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 3600 * 1000;

function floorToFiveMin(date: Date): Date {
  return new Date(Math.floor(date.getTime() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS);
}

/** Convert an ISO timestamp to the `YYYY-MM-DDTHH:mm` format the datetime-local input wants. */
export function isoToLocalInputFormat(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Compute a sensible default for the Smart Assign departure-time input.
 * Pure function — no I/O, no side effects, deterministic for a given `now`.
 */
export function deriveDefaultDeparture(input: DeriveDefaultDepartureInput): DepartureSuggestion {
  const now = input.now ?? new Date();
  const pickup = input.firstPickupApptStart;

  if (!pickup || pickup.getTime() <= now.getTime()) {
    const fallback = new Date(now.getTime() + ONE_HOUR_MS);
    return {
      isoTime: fallback.toISOString(),
      source: 'FALLBACK_PAST_APPT',
      note: 'Pickup appointment in the past — review',
      deadheadMinutes: 0,
    };
  }

  const distance = input.driverDistanceMilesFromPickup;
  if (distance == null) {
    const fallback = new Date(pickup.getTime() - ONE_HOUR_MS);
    return {
      isoTime: fallback.toISOString(),
      source: 'FALLBACK_NO_LOCATION',
      note: 'Driver location unknown — assumed 1h deadhead',
      deadheadMinutes: 60,
    };
  }

  const deadheadHours = Math.max(0, distance) / AVG_FLEET_SPEED_MPH;
  const totalOffsetMs = (deadheadHours + PRE_TRIP_BUFFER_HOURS + SAFETY_BUFFER_HOURS) * ONE_HOUR_MS;
  const derived = floorToFiveMin(new Date(pickup.getTime() - totalOffsetMs));
  const deadheadMinutes = Math.round(deadheadHours * 60);

  return {
    isoTime: derived.toISOString(),
    source: 'DERIVED',
    note:
      deadheadMinutes > 0
        ? `Suggested — ~${deadheadMinutes}m drive + 15m pre-trip`
        : 'Suggested — 15m pre-trip (driver at pickup)',
    deadheadMinutes,
  };
}
