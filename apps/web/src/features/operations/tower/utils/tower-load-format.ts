import type { ActiveLoadStop, ActiveLoadView } from '@sally/shared-types';
import { formatTime } from '@/shared/lib/utils/formatters';

/**
 * Shared load-formatting helpers for the Tower surfaces (spine lane + loads
 * drawer). Single source of truth so the lane and the drawer never drift.
 */

function stopLabel(city?: string | null, state?: string | null): string {
  if (city && state) return `${city}, ${state}`;
  return city ?? state ?? '';
}

/** Origin → destination lane string, from current/next stop cities. */
export function loadLane(load: ActiveLoadView): string {
  const from = stopLabel(load.currentStop?.city, load.currentStop?.state);
  const to = stopLabel(load.nextStop?.city, load.nextStop?.state);
  if (!from && !to) return '—';
  // Same origin and destination (local move / round trip) — show it once
  // rather than the glitch-looking "Boston, MA → Boston, MA".
  if (from && to && from === to) return from;
  return `${from || '—'} → ${to || '—'}`;
}

/**
 * Lane string for the headline card. Prefers current → next cities; when no
 * city data exists at all, falls back to the customer name so the card never
 * reads as a bare "—".
 */
export function headlineLane(load: ActiveLoadView): string {
  const lane = loadLane(load);
  if (lane !== '—') return lane;
  return load.customerName ?? '—';
}

/**
 * Formats a slack magnitude (minutes, always positive) into a compact human
 * label: minutes under an hour, hours under a day, otherwise ">1d" — a
 * dispatcher needs "late by a lot", not a raw −86640m.
 */
export function formatSlackMagnitude(absMinutes: number): string {
  if (absMinutes < 60) return `${absMinutes}m`;
  if (absMinutes < 24 * 60) return `${Math.round(absMinutes / 60)}h`;
  return '>1d';
}

/**
 * Human slack phrase for the headline card, e.g. "38m slack", "2h slack",
 * "overdue". Never exposes a raw negative minute count.
 */
export function formatSlackPhrase(slackMinutes: number | null): string | null {
  if (slackMinutes === null) return null;
  if (slackMinutes < 0) {
    const mag = formatSlackMagnitude(Math.abs(slackMinutes));
    return mag === '>1d' ? 'overdue' : `${mag} late`;
  }
  return `${formatSlackMagnitude(slackMinutes)} slack`;
}

/**
 * The card's "next stop" line: "pickup 14:00 · 38m slack". Returns null when
 * there is no next stop at all so callers can omit the line entirely.
 */
export function nextStopLine(load: ActiveLoadView): string | null {
  const stop = load.nextStop;
  if (!stop) return null;
  const verb = stop.kind === 'pickup' ? 'pickup' : 'delivery';
  const when = stop.appointmentAt ? formatTime(new Date(stop.appointmentAt)) : null;
  const slack = formatSlackPhrase(load.slackMinutes);
  const parts = [verb, when].filter(Boolean).join(' ');
  return slack ? `${parts} · ${slack}` : parts;
}

/**
 * Quiet location line for the headline card. Uses the current stop city when
 * known; otherwise derives "En route to <next city>" from the next stop. A
 * card with no location data renders nothing rather than a scary placeholder.
 */
export function currentLocationLabel(load: ActiveLoadView): string | null {
  const current = stopLabel(load.currentStop?.city, load.currentStop?.state);
  if (current) return current;
  const next = stopLabel(load.nextStop?.city, load.nextStop?.state);
  if (next) return `En route to ${next}`;
  return null;
}

/** Short appointment clock label for a stop, e.g. "2:00p" or "—". */
export function stopApptLabel(stop: ActiveLoadStop | null): string {
  if (!stop?.appointmentAt) return '—';
  return formatTime(new Date(stop.appointmentAt));
}
