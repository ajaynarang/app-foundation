import { RecurringLaneStatus } from '@sally/shared-types';
import type { RecurringLaneStatus as RecurringLaneStatusType } from '@sally/shared-types';

export type {
  RecurringLane,
  RecurringLaneStop,
  CreateRecurringLaneStopInput as CreateRecurringLaneStop,
  CreateRecurringLaneInput as CreateRecurringLane,
  UpdateRecurringLaneInput as UpdateRecurringLane,
  LanePreview,
  PaginatedRecurringLanes,
} from '@sally/shared-types';

export { RecurringLaneStatus };
export type { RecurringLaneStatusType };

export interface RecurringLaneFilters {
  search?: string;
  /** Canonical uppercase enum value (e.g. `DRAFT`) — never a lowercase literal. */
  status?: RecurringLaneStatusType;
  limit?: number;
  offset?: number;
}

/** Single source of truth for status display labels, keyed by the canonical enum. */
export const RECURRING_LANE_STATUS_LABELS: Record<RecurringLaneStatusType, string> = {
  [RecurringLaneStatus.DRAFT]: 'Draft',
  [RecurringLaneStatus.ACTIVE]: 'Active',
  [RecurringLaneStatus.PAUSED]: 'Paused',
  [RecurringLaneStatus.EXPIRED]: 'Expired',
};
