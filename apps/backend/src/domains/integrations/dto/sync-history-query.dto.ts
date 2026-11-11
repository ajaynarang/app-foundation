import { QueryEnum, QueryInt, QueryLimit, QueryString } from '@appshore/kernel/shared/utils/query-dto';

export const SYNC_STATUSES = ['running', 'success', 'failed'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** `GET /integrations/:integration_id/sync-history` — `limit` (1…100, default 50), `offset`. */
export class IntegrationSyncHistoryQueryDto {
  @QueryLimit({ default: 50 })
  limit!: number;

  @QueryInt({ min: 0, default: 0 })
  offset!: number;
}

/**
 * `GET /integrations/sync-history` — `limit` (1…100, default 20), `offset`, `sync_type`, `status`
 * (running | success | failed).
 */
export class SyncHistoryQueryDto {
  @QueryLimit({ default: 20 })
  limit!: number;

  @QueryInt({ min: 0, default: 0 })
  offset!: number;

  @QueryString({ name: 'sync_type' })
  syncType?: string;

  @QueryEnum(SYNC_STATUSES)
  status?: SyncStatus;
}
