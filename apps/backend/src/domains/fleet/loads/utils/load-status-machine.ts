import { BadRequestException } from '@nestjs/common';

export const VALID_LOAD_STATUSES = [
  'TENDER',
  'DRAFT',
  'PENDING',
  'ASSIGNED',
  'IN_TRANSIT',
  'ON_HOLD',
  'DELIVERED',
  'CANCELLED',
  'TONU',
] as const;

export type LoadStatusType = (typeof VALID_LOAD_STATUSES)[number];

export const LOAD_STATUS_TRANSITIONS: Record<string, string[]> = {
  TENDER: ['PENDING', 'CANCELLED'],
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['DRAFT', 'ASSIGNED', 'ON_HOLD', 'CANCELLED'],
  ASSIGNED: ['PENDING', 'IN_TRANSIT', 'ON_HOLD', 'CANCELLED', 'TONU'],
  IN_TRANSIT: ['ASSIGNED', 'DELIVERED', 'ON_HOLD', 'CANCELLED', 'TONU'],
  ON_HOLD: ['DRAFT', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'CANCELLED'],
  DELIVERED: ['IN_TRANSIT'],
  CANCELLED: ['PENDING'],
  TONU: ['PENDING'],
};

const STATUS_TIMESTAMP_MAP: Record<string, string | null> = {
  TENDER: null,
  DRAFT: null,
  PENDING: null,
  ASSIGNED: 'assignedAt',
  IN_TRANSIT: 'inTransitAt',
  ON_HOLD: 'onHoldAt',
  DELIVERED: 'deliveredAt',
  CANCELLED: 'cancelledAt',
  TONU: 'tonuAt',
};

export function validateLoadTransition(from: string, to: string): void {
  if (!VALID_LOAD_STATUSES.includes(to as LoadStatusType)) {
    throw new BadRequestException(`Invalid status: ${to}. Valid statuses: ${VALID_LOAD_STATUSES.join(', ')}`);
  }

  const allowed = LOAD_STATUS_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new BadRequestException(
      `Invalid transition: ${from} → ${to}. Allowed from ${from}: ${(allowed || []).join(', ') || 'none (terminal state)'}`,
    );
  }
}

export function getTimestampFieldForStatus(status: string): string | null {
  return STATUS_TIMESTAMP_MAP[status] ?? null;
}
