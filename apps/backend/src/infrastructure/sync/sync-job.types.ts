export { SyncAction, SyncActionLog } from './sync-action-log';

export type TelemetryJobType = 'hos' | 'gps' | 'dvir' | 'fleet-sync';
export type VendorDataJobType = 'drivers' | 'vehicles' | 'loads';
export type SyncJobType = TelemetryJobType | VendorDataJobType;

/**
 * Inner payload shape for an integration sync job (TMS or ELD).
 *
 * Wrapped in a standard `JobEnvelope<IntegrationSyncPayload>` before being
 * pushed to either the TELEMETRY or VENDOR_DATA queue.
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
  integrationType: 'TMS' | 'ELD';
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
