import { BadRequestException } from '@nestjs/common';

export const VALID_TRIP_STATUSES = ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

export type TripStatusType = (typeof VALID_TRIP_STATUSES)[number];

/**
 * Manual transitions only. IN_PROGRESS and COMPLETED are auto-derived
 * from load statuses and cannot be set manually.
 */
export const TRIP_MANUAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['CANCELLED'],
  // IN_PROGRESS: no manual transitions (cancel individual loads instead)
  // COMPLETED: terminal state
  // CANCELLED: terminal state
};

const TRIP_STATUS_TIMESTAMP_MAP: Record<string, string | null> = {
  DRAFT: null,
  ASSIGNED: 'assignedAt',
  IN_PROGRESS: 'startedAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
};

export function validateTripManualTransition(from: string, to: string): void {
  const allowed = TRIP_MANUAL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new BadRequestException(
      `Cannot transition trip from '${from}' to '${to}'. ${
        from === 'IN_PROGRESS'
          ? 'In-progress trips cannot be cancelled at the trip level. Cancel individual loads instead.'
          : from === 'COMPLETED' || from === 'CANCELLED'
            ? `'${from}' is a terminal state.`
            : `Allowed from '${from}': ${(allowed || []).join(', ') || 'none'}.`
      }`,
    );
  }
}

export function getTripTimestampField(status: string): string | null {
  return TRIP_STATUS_TIMESTAMP_MAP[status] ?? null;
}
