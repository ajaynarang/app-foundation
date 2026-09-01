import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { BaseQueueDispatcher } from '../../../queue/base-queue-dispatcher';
import { DeadLetterService } from '../../../queue/dead-letter.service';
import { jobHandlersToken, type QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { WHATSAPP_QUEUE_CONCURRENCY, WHATSAPP_QUEUE_LIMITER, WHATSAPP_QUEUE_NAME } from './whatsapp.constants';

/** E95 — the single consumer of the `whatsapp` queue. See WHATSAPP_QUEUE_NAME for why it is its own queue. */
@Injectable()
@Processor(WHATSAPP_QUEUE_NAME, { concurrency: WHATSAPP_QUEUE_CONCURRENCY, limiter: WHATSAPP_QUEUE_LIMITER })
export class WhatsAppQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(WhatsAppQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(WHATSAPP_QUEUE_NAME)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
