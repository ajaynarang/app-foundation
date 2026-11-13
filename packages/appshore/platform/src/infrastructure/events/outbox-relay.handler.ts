import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { withJobContext } from '@appshore/kernel/infrastructure/logging/job-log-context';
import { OutboxRelay, type OutboxRelayResult } from './outbox-relay.service';

/** Owns `outbox-relay` on the `bulk-ops` queue — the single BulkOpsQueueProcessor routes by name. */
@Injectable()
export class OutboxRelayJobHandler implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.OUTBOX_RELAY] as const;

  constructor(private readonly relay: OutboxRelay) {}

  run(job: Job): Promise<OutboxRelayResult> {
    return withJobContext(job, () => this.relay.tick());
  }
}
