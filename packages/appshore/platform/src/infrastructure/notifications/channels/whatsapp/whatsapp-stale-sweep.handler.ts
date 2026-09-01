import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DeliveryLedgerService } from '../../pipeline/delivery-ledger.service';
import {
  WHATSAPP_STALE_CLAIMED_AFTER_MS,
  WHATSAPP_STALE_SWEEP_JOB_NAME,
  WHATSAPP_STALE_UNCLAIMED_AFTER_MS,
} from './whatsapp.constants';

/**
 * Rows a deploy window strands. An old worker completes an unknown job name
 * as a no-op, so the ledger row stays QUEUED with nothing coming. The row
 * does not carry the rendered send, so it cannot be re-queued from here —
 * it is closed as QUEUE_LOST and the count is the alert a human acts on.
 */
@Injectable()
export class WhatsAppStaleSweepHandler implements QueueJobHandler {
  readonly jobNames = [WHATSAPP_STALE_SWEEP_JOB_NAME];
  private readonly logger = new Logger(WhatsAppStaleSweepHandler.name);

  constructor(private readonly ledger: DeliveryLedgerService) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<{ unclaimed: number; claimed: number }> {
    const now = Date.now();
    const unclaimed = await this.ledger.staleQueued({
      olderThan: new Date(now - WHATSAPP_STALE_UNCLAIMED_AFTER_MS),
      claimed: false,
    });
    const claimed = await this.ledger.staleQueued({
      olderThan: new Date(now - WHATSAPP_STALE_CLAIMED_AFTER_MS),
      claimed: true,
    });
    const lost = [...unclaimed, ...claimed].map((row) => row.id);
    if (lost.length > 0) {
      await this.ledger.markQueueLost(lost);
      this.logger.error(
        `WhatsApp stale sweep: ${unclaimed.length} never sent, ${claimed.length} never acknowledged — closed as QUEUE_LOST`,
      );
    }
    return { unclaimed: unclaimed.length, claimed: claimed.length };
  }
}
