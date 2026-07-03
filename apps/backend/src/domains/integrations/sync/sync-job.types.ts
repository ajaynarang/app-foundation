export { SyncAction, SyncActionLog } from './sync-action-log';

/**
 * Generic integration sync job type. Apps define their own concrete vendor
 * job types as plain strings; the router below maps every sync job onto the
 * shared `events`/`bulk-ops` queue topology.
 */
export type SyncJobType = string;

/**
 * Inner payload shape for an integration sync job.
 *
 * Wrapped in a standard `JobEnvelope<IntegrationSyncPayload>` before being
 * pushed to its target queue.
 *
 * Note: `tenantId` here is the numeric DB id (downstream services need it
 * that way); the envelope's `tenantId` is the wire-format slug. Both must
 * be kept in sync at the producer site.
 */
export interface IntegrationSyncPayload {
  jobId?: number;
  tenantId: number;
  integrationId: number;
  integrationName: string;
  /** Free-form vendor/integration type — e.g. the IntegrationType enum value. */
  integrationType: string;
  type: SyncJobType;
  triggerSource: 'scheduled' | 'manual' | 'auto';
}

/**
 * @deprecated Use `IntegrationSyncPayload` wrapped in `JobEnvelope` instead.
 * Type alias retained so a few in-flight callsites compile during the
 * queue-topology migration.
 */
export type SyncJobData = IntegrationSyncPayload;

export interface SyncResult {
  recordsProcessed: number;
  recordsCreated: number;
  recordsExisting: number;
  details?: Record<string, unknown>;
}
