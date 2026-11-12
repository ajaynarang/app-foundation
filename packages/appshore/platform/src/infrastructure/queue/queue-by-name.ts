import type { ModuleRef } from '@nestjs/core';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/**
 * The registered BullMQ queue with this name, or null when none is registered. Readers of the job vocabulary use it
 * instead of injecting one queue per kernel name, so an app queue declared in `job-names.ts` (and registered by the
 * app's queue module) is found too.
 */
export function queueByName(moduleRef: ModuleRef, name: string): Queue | null {
  try {
    return moduleRef.get<Queue>(getQueueToken(name), { strict: false });
  } catch {
    return null;
  }
}
