import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent, EventActor } from './domain-event';
import { DurableEventJobData } from './durable-event.types';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { buildJobEnvelope } from '../queue/job-envelope.helper';
import { toLoggableError } from '../queue/job-events';
import { ERROR_SOURCE, reportError } from '../error-tracking/sentry';

@Injectable()
export class DomainEventService {
  private readonly logger = new Logger(DomainEventService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.EVENTS)
    private readonly durableQueue: Queue,
  ) {}

  /**
   * Emit a domain event built here (new id, now, actor from EventContext when
   * not given).
   *
   * Hot path (instant, in-process): EventEmitter2 → cache invalidation, SSE bridge
   * Durable path (crash-safe): BullMQ → persistence, webhooks
   *
   * A failed durable enqueue is logged and reported, not thrown: nothing records the event,
   * so a write that must not lose it emits through the platform OutboxService
   * instead (ADR "Outbox and deadlines").
   */
  async emit<T = unknown>(
    eventName: string,
    tenantId: string | number,
    data: T,
    actor?: EventActor,
    options?: { correlationId?: string; causationId?: string },
  ): Promise<void> {
    const event = new DomainEvent(
      eventName,
      String(tenantId),
      data,
      actor,
      options?.correlationId,
      options?.causationId,
    );

    this.publishHot(event);
    try {
      await this.enqueueDurable(event);
    } catch (error) {
      // The hot path already delivered, so this is not thrown. But webhooks and the event log will never see the
      // event: an incident, so it is reported as well as logged.
      this.logger.warn({ msg: `Failed to queue durable event ${eventName}`, err: toLoggableError(error) });
      reportError(error, {
        tenantId: String(tenantId),
        jobName: eventName,
        queue: QUEUE_NAMES.EVENTS,
        source: ERROR_SOURCE.EVENT,
      });
    }
  }

  /**
   * Publish an event that already exists (an outbox row — ADR "Outbox and deadlines") through the
   * same two paths, keeping its id and timestamp, so the durable job id, the
   * `domain_event_log` row and webhook deliveries all carry the event's own id.
   *
   * Unlike `emit`, a failed durable enqueue THROWS: the caller still holds the
   * event and must not mark it published. Re-publishing is safe — the durable
   * job id is the event id, and every consumer is keyed on it.
   */
  async publish(event: DomainEvent): Promise<void> {
    this.publishHot(event);
    await this.enqueueDurable(event);
  }

  /** HOT PATH — instant, in-process. Cache invalidation + SSE bridge listen here. */
  private publishHot(event: DomainEvent): void {
    this.eventEmitter.emit(event.event, event);
  }

  /** DURABLE PATH — crash-safe, cross-instance. Persistence + webhook dispatch run in DurableEventProcessor. */
  private async enqueueDurable(event: DomainEvent): Promise<void> {
    const jobData: DurableEventJobData = {
      id: event.id,
      event: event.event,
      tenantId: event.tenantId,
      data: event.data,
      actor: event.actor
        ? {
            id: event.actor.id,
            type: event.actor.type,
            label: event.actor.label ?? null,
          }
        : null,
      correlationId: event.correlationId ?? null,
      causationId: event.causationId ?? null,
      version: event.version,
      timestamp: event.timestamp.toISOString(),
    };

    await this.durableQueue.add(
      event.event,
      buildJobEnvelope(jobData, {
        tenantId: String(jobData.tenantId),
        source: 'event',
        correlationId: jobData.correlationId ?? undefined,
        causationId: jobData.causationId ?? undefined,
      }),
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
        jobId: `${event.event}-${jobData.id}`,
      },
    );
  }
}
