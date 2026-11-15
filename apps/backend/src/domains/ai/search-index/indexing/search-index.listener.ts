import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { APP_JOB_NAMES } from '../../../../platform-glue/queue/job-names';
import { SEARCH_SUBJECTS, type SearchSubject } from '../search-subject';

export interface SearchIndexPayload {
  tenantId: number;
  subjectType: string;
  subjectId: string;
}

/**
 * Keeps the search index in step with the records: every domain event a registered subject listens for becomes one
 * `search-index` job per record it touched.
 *
 * The index is a projection that can be rebuilt, so an enqueue that fails is logged and never fails the flow that
 * raised the event; `pnpm search:rebuild` repairs what was missed. The job id is the event's id and the record's, so
 * a redelivered event does not index twice.
 */
@Injectable()
export class SearchIndexListener {
  private readonly logger = new Logger(SearchIndexListener.name);
  private readonly byEvent = new Map<string, SearchSubject[]>();

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_BACKGROUND) private readonly queue: Queue,
    @Inject(SEARCH_SUBJECTS) subjects: readonly SearchSubject[],
  ) {
    for (const subject of subjects)
      for (const event of subject.events) this.byEvent.set(event, [...(this.byEvent.get(event) ?? []), subject]);
  }

  @OnEvent('app.**', { async: true })
  async handleDomainEvent(event: DomainEvent): Promise<void> {
    const subjects = this.byEvent.get(event.event);
    if (!subjects) return;
    const tenantId = Number(event.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return;
    for (const subject of subjects) {
      let ids: string[];
      try {
        ids = [...new Set(subject.subjectIdsFor(event))];
      } catch (err) {
        this.logger.warn(`Search index: ${subject.type} could not read ${event.event} (${(err as Error).message})`);
        continue;
      }
      for (const subjectId of ids) await this.enqueue(event, tenantId, subject.type, subjectId);
    }
  }

  private async enqueue(event: DomainEvent, tenantId: number, subjectType: string, subjectId: string): Promise<void> {
    try {
      await this.queue.add(
        APP_JOB_NAMES.AI_BACKGROUND.SEARCH_INDEX,
        buildJobEnvelope<SearchIndexPayload>(
          { tenantId, subjectType, subjectId },
          { tenantId: String(tenantId), source: 'event', correlationId: event.correlationId, causationId: event.id },
        ),
        {
          jobId: `search-index-${event.id}-${subjectType}-${subjectId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.warn(`Search index: enqueue failed for ${subjectType} ${subjectId} (${(err as Error).message})`);
    }
  }
}
