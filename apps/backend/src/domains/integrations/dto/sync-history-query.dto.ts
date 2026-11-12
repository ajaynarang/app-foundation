import { CursorQueryDto, QueryEnum, QueryString } from '@appshore/kernel/shared/utils/query-dto';

export const SYNC_STATUSES = ['running', 'success', 'failed'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** `GET /integrations/:integration_id/sync-history` — `limit` (1…100, default 50), `cursor`. */
export class IntegrationSyncHistoryQueryDto extends CursorQueryDto {}

/**
 * `GET /integrations/sync-history` — `limit` (1…100, default 50), `cursor`, `sync_type`, `status`
 * (running | success | failed).
 */
export class SyncHistoryQueryDto extends CursorQueryDto {
  @QueryString({ name: 'sync_type' })
  syncType?: string;

  @QueryEnum(SYNC_STATUSES)
  status?: SyncStatus;
}
