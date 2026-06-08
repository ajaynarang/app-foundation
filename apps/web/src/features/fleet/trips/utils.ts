/**
 * Deterministic color from a trip ID string.
 * Uses a simple hash to pick from a palette of muted steel-blue shades.
 */
const TRIP_COLORS = [
  '#4B6A8A', // steel blue
  '#5A7D9A', // blue-gray
  '#6B8EAA', // soft blue
  '#7A9FBA', // light steel
  '#4A7A6A', // teal-gray
  '#5A8A7A', // muted teal
] as const;

export function getTripColor(tripId: string): string {
  let hash = 0;
  for (let i = 0; i < tripId.length; i++) {
    hash = (hash << 5) - hash + tripId.charCodeAt(i);
    hash |= 0;
  }
  return TRIP_COLORS[Math.abs(hash) % TRIP_COLORS.length];
}
