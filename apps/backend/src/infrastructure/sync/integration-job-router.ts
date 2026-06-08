import { QUEUE_NAMES, TELEMETRY_JOB_NAMES, VENDOR_DATA_JOB_NAMES, type QueueName } from '../queue/queue.constants';
import type { SyncJobType, TelemetryJobType, VendorDataJobType } from './sync-job.types';

/**
 * Routing decision for an integration sync job — which queue does it
 * belong on, and which BullMQ job-name should it carry?
 *
 * Built so producers stay DRY across the manual-sync controller, the
 * scheduled cron, and the admin retry endpoints.
 */
export interface IntegrationJobRoute {
  queue: typeof QUEUE_NAMES.TELEMETRY | typeof QUEUE_NAMES.VENDOR_DATA;
  jobName: string;
}

const TELEMETRY_NAME_BY_TYPE: Record<TelemetryJobType, string> = {
  hos: TELEMETRY_JOB_NAMES.HOS,
  gps: TELEMETRY_JOB_NAMES.GPS,
  dvir: TELEMETRY_JOB_NAMES.DVIR,
  'fleet-sync': TELEMETRY_JOB_NAMES.FLEET_SYNC,
};

const VENDOR_DATA_NAME_BY_TYPE: Record<VendorDataJobType, string> = {
  drivers: VENDOR_DATA_JOB_NAMES.TMS_DRIVERS,
  vehicles: VENDOR_DATA_JOB_NAMES.TMS_VEHICLES,
  loads: VENDOR_DATA_JOB_NAMES.TMS_LOADS,
};

/**
 * Return the queue + job-name for the given integration sync type.
 *
 * - ELD types (`hos`, `gps`, `dvir`, `fleet-sync`) → `telemetry` queue
 * - TMS types (`drivers`, `vehicles`, `loads`)     → `vendor-data` queue
 */
export function routeIntegrationJob(type: SyncJobType): IntegrationJobRoute {
  if (type in TELEMETRY_NAME_BY_TYPE) {
    return {
      queue: QUEUE_NAMES.TELEMETRY,
      jobName: TELEMETRY_NAME_BY_TYPE[type as TelemetryJobType],
    };
  }
  if (type in VENDOR_DATA_NAME_BY_TYPE) {
    return {
      queue: QUEUE_NAMES.VENDOR_DATA,
      jobName: VENDOR_DATA_NAME_BY_TYPE[type as VendorDataJobType],
    };
  }
  throw new Error(`Unknown integration sync type: ${String(type)}`);
}

/**
 * Convenience predicate so call-sites can check which queue a `QueueName`
 * variable resolves to without importing both sets of constants.
 */
export function isTelemetryQueue(name: QueueName): boolean {
  return name === QUEUE_NAMES.TELEMETRY;
}
