import { Test } from '@nestjs/testing';
import type { JobEnvelope } from '@app/shared-types';
import { DurableEventProcessor } from '../durable-event.processor';
import { EventPersistenceSubscriber } from '../event-persistence.subscriber';
import { WebhookDispatcher } from '../../outbound-webhooks/dispatcher.service';
import { TenantIdResolver } from '../tenant-id-resolver.service';
import { DeadLetterService } from '../../queue/dead-letter.service';
import { DurableEventJobData } from '../durable-event.types';

describe('DurableEventProcessor', () => {
  let processor: DurableEventProcessor;
  let persistence: { persistEvent: jest.Mock };
  let webhookDispatcher: { dispatchEvent: jest.Mock };
  let tenantResolver: { resolveToSlug: jest.Mock };
  let deadLetter: { recordPermanentFailure: jest.Mock };

  beforeEach(async () => {
    persistence = { persistEvent: jest.fn().mockResolvedValue(undefined) };
    webhookDispatcher = {
      dispatchEvent: jest.fn().mockResolvedValue(undefined),
    };
    // By default the resolver is a no-op: returns whatever it was given so
    // existing tests that assert tenantId='tenant-1' keep passing. Individual
    // tests that want to exercise the numeric→slug path can override this.
    tenantResolver = {
      resolveToSlug: jest.fn(async (raw: string) => raw),
    };
    deadLetter = {
      recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        DurableEventProcessor,
        { provide: EventPersistenceSubscriber, useValue: persistence },
        { provide: WebhookDispatcher, useValue: webhookDispatcher },
        { provide: TenantIdResolver, useValue: tenantResolver },
        { provide: DeadLetterService, useValue: deadLetter },
      ],
    }).compile();

    processor = module.get(DurableEventProcessor);
  });

  function makeEnvelope(payload: DurableEventJobData): JobEnvelope<DurableEventJobData> {
    return {
      tenantId: payload.tenantId,
      correlationId: payload.correlationId ?? 'corr-default',
      causationId: payload.causationId ?? undefined,
      payload,
      metadata: {
        enqueuedAt: '2026-04-10T12:00:00.000Z',
        source: 'event',
        version: 1,
      },
    };
  }

  function makeJob(data: DurableEventJobData): any {
    return { data: makeEnvelope(data), id: 'job-1', name: data.event };
  }

  const sampleJobData: DurableEventJobData = {
    id: 'evt-1',
    event: 'app.load.created',
    tenantId: 'tenant-1',
    data: { entityId: 'LD-1', entityType: 'load' },
    actor: { id: 'u-1', type: 'user', label: 'John' },
    correlationId: 'corr-1',
    causationId: null,
    version: 1,
    timestamp: '2026-04-10T12:00:00.000Z',
  };

  it('calls persistence then webhook dispatch', async () => {
    await processor.process(makeJob(sampleJobData));

    expect(persistence.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'app.load.created',
        tenantId: 'tenant-1',
      }),
    );
    expect(webhookDispatcher.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'app.load.created',
      }),
    );
  });

  it('calls persistence before webhooks (sequential)', async () => {
    const callOrder: string[] = [];
    persistence.persistEvent.mockImplementation(async () => {
      callOrder.push('persist');
    });
    webhookDispatcher.dispatchEvent.mockImplementation(async () => {
      callOrder.push('webhook');
    });

    await processor.process(makeJob(sampleJobData));

    expect(callOrder).toEqual(['persist', 'webhook']);
  });

  it('reconstructs DomainEvent with original id and timestamp', async () => {
    await processor.process(makeJob(sampleJobData));

    const passedEvent = persistence.persistEvent.mock.calls[0][0];
    expect(passedEvent.id).toBe('evt-1');
    expect(passedEvent.timestamp).toEqual(new Date('2026-04-10T12:00:00.000Z'));
    expect(passedEvent.version).toBe(1);
    expect(passedEvent.actor).toEqual({
      id: 'u-1',
      type: 'user',
      label: 'John',
    });
  });

  it('reconstructs event without actor when null', async () => {
    const data = { ...sampleJobData, actor: null };
    await processor.process(makeJob(data));

    const passedEvent = persistence.persistEvent.mock.calls[0][0];
    expect(passedEvent.actor).toBeUndefined();
  });

  it('reconstructs event with correlationId', async () => {
    await processor.process(makeJob(sampleJobData));

    const passedEvent = persistence.persistEvent.mock.calls[0][0];
    expect(passedEvent.correlationId).toBe('corr-1');
    expect(passedEvent.causationId).toBeUndefined();
  });

  it('propagates persistence errors for BullMQ retry', async () => {
    persistence.persistEvent.mockRejectedValue(new Error('DB down'));

    await expect(processor.process(makeJob(sampleJobData))).rejects.toThrow('DB down');
  });

  it('propagates webhook errors for BullMQ retry', async () => {
    webhookDispatcher.dispatchEvent.mockRejectedValue(new Error('dispatch failed'));

    await expect(processor.process(makeJob(sampleJobData))).rejects.toThrow('dispatch failed');
  });

  it('skips webhook dispatch when persistence fails', async () => {
    persistence.persistEvent.mockRejectedValue(new Error('DB down'));

    try {
      await processor.process(makeJob(sampleJobData));
    } catch {
      // expected
    }

    expect(webhookDispatcher.dispatchEvent).not.toHaveBeenCalled();
  });

  describe('onFailed (dead-letter)', () => {
    it('records permanent failure to DLQ on final attempt', async () => {
      const job: any = {
        id: 'job-9',
        name: 'app.load.created',
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: makeEnvelope(sampleJobData),
      };
      const err = new Error('terminal');

      await processor.onFailed(job, err);

      expect(deadLetter.recordPermanentFailure).toHaveBeenCalledWith(job, err);
    });

    it('does not record DLQ on intermediate failures', async () => {
      const job: any = {
        id: 'job-9',
        name: 'app.load.created',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: makeEnvelope(sampleJobData),
      };

      await processor.onFailed(job, new Error('retry me'));

      expect(deadLetter.recordPermanentFailure).not.toHaveBeenCalled();
    });
  });
});
