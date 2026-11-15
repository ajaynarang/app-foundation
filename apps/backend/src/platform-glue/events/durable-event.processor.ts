import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { DurableEventJobData } from '@appshore/kernel/infrastructure/events/durable-event.types';
import { EventPersistenceSubscriber } from './event-persistence.subscriber';
import { WebhookDispatcher } from '../webhooks/dispatcher.service';
import { TenantIdResolver } from '@appshore/platform/infrastructure/events/tenant-id-resolver.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';
import { withJobContext } from '@appshore/kernel/infrastructure/logging/job-log-context';
import { reportJobFailure } from '@appshore/kernel/infrastructure/queue/job-events';

/** The events queue's own default when a job is added without `attempts`. */
const EVENT_JOB_DEFAULT_ATTEMPTS = 3;

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
    return withJobContext(job, async () => {
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

  /**
   * One structured `job.failed` line per failed attempt (the line alert rules key on), and the dead-letter row once
   * BullMQ has failed the job for good, including an `UnrecoverableError` before the attempts run out.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error): Promise<void> {
    if (reportJobFailure(this.logger, job, err, EVENT_JOB_DEFAULT_ATTEMPTS)) {
      await this.deadLetter.recordPermanentFailure(job, err);
    }
  }
}
