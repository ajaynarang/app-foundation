import { LocationPrecision } from '@prisma/client';

/**
 * Minimum geocode confidence we trust for placing a stop on the map. Matches the
 * gate in StopGeocodingService — below this, coordinates are not persisted, so the
 * stop's location is effectively unknown.
 */
const MIN_GEOCODE_CONFIDENCE = 0.5;

/**
 * Classify a stop's geocode precision so the import merge-matcher knows whether the
 * point is a specific dock (ROOFTOP — had a street address) or just a city/ZIP
 * centroid (CENTROID — no street). A vague centroid must never be auto-merged onto a
 * precise dock, so this distinction drives StopMatchService's tiering.
 */
export function derivePrecision(input: { hasStreet: boolean; geocodeConfidence: number | null }): LocationPrecision {
  if (input.geocodeConfidence == null || input.geocodeConfidence < MIN_GEOCODE_CONFIDENCE) {
    return LocationPrecision.UNKNOWN;
  }
  return input.hasStreet ? LocationPrecision.ROOFTOP : LocationPrecision.CENTROID;
}
