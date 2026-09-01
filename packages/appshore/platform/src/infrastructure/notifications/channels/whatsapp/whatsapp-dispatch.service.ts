import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { NotificationType } from '@appshore/db';
import { bullJobIdFromDbId } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import type { PendingWhatsAppSend } from '../../pipeline/delivery.service';
import type { WhatsAppTemplateSendSpec } from './whatsapp-template.registry';
import {
  WHATSAPP_JOB_CATEGORY,
  WHATSAPP_QUEUE_NAME,
  WHATSAPP_SEND_ATTEMPTS,
  WHATSAPP_SEND_BACKOFF_MS,
  WHATSAPP_SEND_JOB_NAME,
} from './whatsapp.constants';

/**
 * What rides the queue. No phone: the handler reads it from the DB at send
 * time. The rendered body values do ride along — a batch name, a day, a club —
 * the same class of text a push payload carries, and unlike a chat message
 * they exist nowhere else to re-derive from.
 */
export interface WhatsAppSendJobPayload {
  deliveryId: string;
  userId: number;
  type: NotificationType;
  send: WhatsAppTemplateSendSpec;
}

@Injectable()
export class WhatsAppDispatchService {
  private readonly logger = new Logger(WhatsAppDispatchService.name);

  constructor(@InjectQueue(WHATSAPP_QUEUE_NAME) private readonly queue: Queue) {}

  /** One bulk add per trigger, after the ledger rows exist. The job id IS the ledger id. */
  async enqueue(pending: PendingWhatsAppSend[], meta: { tenantId: number; type: NotificationType }): Promise<void> {
    if (pending.length === 0) return;

    const jobs = pending.map(({ deliveryId, userId, send }) => ({
      name: WHATSAPP_SEND_JOB_NAME,
      data: buildJobEnvelope<WhatsAppSendJobPayload>(
        { deliveryId, userId, type: meta.type, send },
        { tenantId: String(meta.tenantId), source: 'event' },
      ),
      opts: {
        jobId: bullJobIdFromDbId(WHATSAPP_JOB_CATEGORY, deliveryId),
        attempts: WHATSAPP_SEND_ATTEMPTS,
        backoff: { type: 'exponential', delay: WHATSAPP_SEND_BACKOFF_MS },
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 7 * 86_400 },
      },
    }));

    try {
      await this.queue.addBulk(jobs);
    } catch (err: any) {
      // The rows are already QUEUED in the ledger; a stale-QUEUED sweep (E95-5) picks them up.
      this.logger.error(`Could not enqueue ${jobs.length} WhatsApp sends for ${meta.type}: ${err.message}`);
    }
  }
}
