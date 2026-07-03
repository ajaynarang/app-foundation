import { v7 as uuidv7 } from 'uuid';

/**
 * Generate a fresh time-sortable UUIDv7. Use for new audit / event / log row
 * inserts on tables whose PK convention is UUIDv7 per id-convention.md Rule 2.
 */
export function generateUuidV7(): string {
  return uuidv7();
}

/**
 * Construct a UUIDv7 with a specific timestamp. Use ONLY for backfilling
 * existing rows during a UUIDv4→v7 (or CUID→v7) migration so historical rows
 * retain their original chronological position when the table is sorted by id.
 */
export function uuidv7FromTimestamp(date: Date): string {
  return uuidv7({ msecs: date.getTime() });
}
