/**
 * A facility name we'd actually show a dispatcher, or undefined. Strips the
 * legacy "Unknown Facility" placeholder (SQ-112) so the importer never carries
 * an invented name — downstream `createImportStop` derives an honest "City, ST"
 * label and flags the stop for facility review instead.
 *
 * A legitimate name that merely contains the word "unknown" (e.g. "Unknown Lane
 * Logistics") is preserved; only the exact placeholder is dropped.
 */
export function realFacilityName(name: string | null | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown facility') return undefined;
  return trimmed;
}
