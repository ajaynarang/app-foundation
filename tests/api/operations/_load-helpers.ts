/**
 * Load-side bootstrap helpers for Phase 3 operations specs. Split out of
 * `_helpers.ts` to keep each file under the 250 LOC guideline.
 *
 * Anything that needs a full `createLoad → assign → deliver` walk lives
 * here. Alert/shield/notification/support seeders (which don't drive the
 * fleet state machine) live in `_helpers.ts`.
 */
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { createLoad, assignLoad, updateLoadStatus, createDriver } from '@sally/test-utils/helpers';
import { buildDriver } from '@sally/test-utils/factories';
import { firstCustomerId } from '../financials/_helpers.js';

export interface DeliveredLoadForMonitoring {
  loadId: string;
  loadNumber: string;
  driverPublicId: string;
}

/**
 * Thin wrapper around the Phase 1 fleet state-machine walk that returns the
 * pieces monitoring/alerting specs usually want.
 *
 * Reuses Phase 1 helpers: `createLoad → assignLoad → updateLoadStatus`.
 * Caller owns cleanup — push `loadId` to a load tracker and
 * `driverPublicId` to a driver tracker.
 *
 * Bounded retry on driver creation (`DRV-` collision — finding #2).
 */
export async function createDeliveredLoadForMonitoring(
  asDispatcher: RoleApiClient,
  asAdmin: RoleApiClient,
): Promise<DeliveredLoadForMonitoring> {
  const customerId = await firstCustomerId(asDispatcher);
  const seed = await createLoad(asDispatcher, customerId);

  let driverPublicId = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const driver = await createDriver(asAdmin, buildDriver());
      driverPublicId = driver.driverId;
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('HTTP 409')) throw err;
    }
  }
  if (!driverPublicId) {
    throw new Error('createDeliveredLoadForMonitoring: POST /drivers returned 409 three times (finding #2)');
  }

  await assignLoad(asDispatcher, seed.loadId, driverPublicId);
  await updateLoadStatus(asDispatcher, seed.loadId, 'IN_TRANSIT');
  await updateLoadStatus(asDispatcher, seed.loadId, 'DELIVERED');

  return {
    loadId: seed.loadId,
    loadNumber: seed.loadNumber,
    driverPublicId,
  };
}
