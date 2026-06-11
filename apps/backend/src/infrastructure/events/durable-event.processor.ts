import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { DomainEvent } from './domain-event';
import { DurableEventJobData } from './durable-event.types';
import { EventPersistenceSubscriber } from './event-persistence.subscriber';
import { WebhookDispatcher } from '../outbound-webhooks/dispatcher.service';
import { TenantIdResolver } from './tenant-id-resolver.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { DeadLetterService } from '../queue/dead-letter.service';
import { withJobLogContext } from '../logging/job-log-context';

@Processor(QUEUE_NAMES.EVENTS, { concurrency: 10 })
export class DurableEventProcessor extends WorkerHost {
  private readonly logger = new Logger(DurableEventProcessor.name);

  constructor(
    private readonly persistence: EventPersistenceSubscriber,
    private readonly webhookDispatcher: WebhookDispatcher,
    private readonly tenantResolver: TenantIdResolver,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<JobEnvelope<DurableEventJobData>>): Promise<void> {
    return withJobLogContext(job, async () => {
      const raw = DomainEvent.fromSerialized(job.data.payload);

      // Normalize the tenantId once for every downstream subscriber. Domain
      // services may pass either a numeric DB id (`String(7)`) or the wire
      // slug (`demo-acme-2026`); persistence and webhook dispatch both
      // need the slug. Centralizing here avoids the bug class of "consumer
      // forgot to resolve" that bit us on the agent webhook path.
      const slug = await this.tenantResolver.resolveToSlug(raw.tenantId);
      if (!slug) {
        this.logger.warn(`Skipping durable event ${raw.event}: cannot resolve tenant ${raw.tenantId}`);
        return;
      }
      const event =
        slug === raw.tenantId
          ? raw
          : DomainEvent.fromSerialized({
              ...job.data.payload,
              tenantId: slug,
            });

      // Sequential — if persistence fails, BullMQ retries both
      // persistEvent is idempotent (upsert) so retries are safe
      await this.persistence.persistEvent(event);
      await this.webhookDispatcher.dispatchEvent(event);
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 3;
    if (job.attemptsMade >= maxAttempts) {
      await this.deadLetter.recordPermanentFailure(job, err);
    }
  }
}
