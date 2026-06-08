/**
 * Status constants for route segments and load stops.
 * Avoids magic strings throughout driver trip components.
 */

export const SEGMENT_STATUS = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
} as const;

export const STOP_STATUS = {
  PENDING: 'PENDING',
  ARRIVED: 'ARRIVED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export const STOP_ACTION = {
  PICKUP: 'pickup',
  DELIVERY: 'delivery',
  BOTH: 'both',
} as const;

export const SEGMENT_TYPE = {
  DOCK: 'dock',
  DRIVE: 'drive',
  REST: 'rest',
  FUEL: 'fuel',
  BREAK: 'break',
} as const;
