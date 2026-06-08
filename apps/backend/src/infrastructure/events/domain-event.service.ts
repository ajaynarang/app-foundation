import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DomainEvent, EventActor } from './domain-event';
import { DurableEventJobData } from './durable-event.types';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { buildJobEnvelope } from '../queue/job-envelope.helper';

@Injectable()
export class DomainEventService {
  private readonly logger = new Logger(DomainEventService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.EVENTS)
    private readonly durableQueue: Queue,
  ) {}

  /**
   * Emit a domain event.
   *
   * Hot path (instant, in-process): EventEmitter2 → cache invalidation, SSE bridge
   * Durable path (crash-safe): BullMQ → persistence, webhooks
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

    // HOT PATH — instant, in-process
    // Cache invalidation + SSE bridge listen here
    this.eventEmitter.emit(eventName, event);

    // DURABLE PATH — crash-safe, cross-instance
    // Persistence + webhook dispatch processed by DurableEventProcessor
    try {
      const jobData: DurableEventJobData = {
        id: event.id,
        event: event.event,
        tenantId: event.tenantId,
        data: event.data as unknown,
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
        eventName,
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
          jobId: `${eventName}-${jobData.id}`,
        },
      );
    } catch (error) {
      // Hot path already delivered — log and move on
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to queue durable event ${eventName}: ${msg}`);
    }
  }
}
