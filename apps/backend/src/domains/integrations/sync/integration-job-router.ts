import { QUEUE_NAMES, type QueueName } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { SyncJobType } from './sync-job.types';

/**
 * Routing decision for an integration sync job — which queue does it belong on,
 * and which BullMQ job-name should it carry?
 *
 * Kept generic for the starter: every sync job runs on the `bulk-ops` queue and
 * carries the sync type as its BullMQ job name. Parameterize this map per app
 * when you need per-vendor queue isolation.
 */
export interface IntegrationJobRoute {
  queue: QueueName;
  jobName: string;
}

/** Optional per-type queue overrides. Defaults to the bulk-ops queue. */
const QUEUE_BY_TYPE: Partial<Record<SyncJobType, QueueName>> = {};

/**
 * Return the queue + job-name for the given integration sync type.
 *
 * The job name is the sync type itself; the queue defaults to `bulk-ops`
 * unless an override is registered in `QUEUE_BY_TYPE`.
 */
export function routeIntegrationJob(type: SyncJobType): IntegrationJobRoute {
  return {
    queue: QUEUE_BY_TYPE[type] ?? QUEUE_NAMES.BULK_OPS,
    jobName: type,
  };
}
