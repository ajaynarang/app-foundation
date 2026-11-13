import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventService } from '../domain-event.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';
import { DomainEvent } from '../domain-event';
import * as errorTracking from '../../error-tracking/sentry';

describe('DomainEventService', () => {
  let service: DomainEventService;
  let eventEmitter: { emit: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({}) };

    const module = await Test.createTestingModule({
      providers: [
        DomainEventService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: getQueueToken(QUEUE_NAMES.EVENTS), useValue: queue },
      ],
    }).compile();

    service = module.get(DomainEventService);
  });

  it('emits to EventEmitter2 (hot path) and BullMQ (durable path)', async () => {
    await service.emit('app.load.created', 'tenant-1', {
      entityId: 'LD-1',
      entityType: 'load',
    });

    // Hot path
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        event: 'app.load.created',
        tenantId: 'tenant-1',
      }),
    );

    // Durable path — envelope-wrapped
    expect(queue.add).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({ source: 'event', version: 1 }),
        payload: expect.objectContaining({
          event: 'app.load.created',
          tenantId: 'tenant-1',
          data: { entityId: 'LD-1', entityType: 'load' },
        }),
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('normalizes numeric tenantId to string', async () => {
    await service.emit('app.load.created', 42, { entityId: 'LD-1' });

    expect(eventEmitter.emit).toHaveBeenCalledWith('app.load.created', expect.objectContaining({ tenantId: '42' }));
    expect(queue.add).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        tenantId: '42',
        payload: expect.objectContaining({ tenantId: '42' }),
      }),
      expect.any(Object),
    );
  });

  it('includes explicit actor in both paths', async () => {
    const actor = { id: 'u-1', type: 'user' as const, label: 'John' };
    await service.emit('app.load.created', 'tenant-1', {}, actor);

    expect(queue.add).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        payload: expect.objectContaining({
          actor: { id: 'u-1', type: 'user', label: 'John' },
        }),
      }),
      expect.any(Object),
    );
  });

  it('sets null actor when none provided', async () => {
    await service.emit('app.load.created', 'tenant-1', {});

    expect(queue.add).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        payload: expect.objectContaining({ actor: null }),
      }),
      expect.any(Object),
    );
  });

  it('includes correlationId and causationId on payload and envelope', async () => {
    await service.emit('app.load.created', 'tenant-1', {}, undefined, {
      correlationId: 'corr-1',
      causationId: 'cause-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        correlationId: 'corr-1',
        causationId: 'cause-1',
        payload: expect.objectContaining({
          correlationId: 'corr-1',
          causationId: 'cause-1',
        }),
      }),
      expect.any(Object),
    );
  });

  it('hot path still fires when BullMQ add fails', async () => {
    queue.add.mockRejectedValue(new Error('Redis down'));

    await service.emit('app.load.created', 'tenant-1', {});

    // Hot path should have been called before queue.add
    expect(eventEmitter.emit).toHaveBeenCalled();
    // Should not throw
  });

  it('reports a failed durable enqueue to the error tracker: webhooks and the event log never see the event', async () => {
    const err = new Error('Redis down');
    queue.add.mockRejectedValue(err);
    const reportSpy = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);

    await service.emit('app.load.created', 'tenant-1', {});

    expect(reportSpy).toHaveBeenCalledWith(err, {
      tenantId: 'tenant-1',
      jobName: 'app.load.created',
      queue: QUEUE_NAMES.EVENTS,
      source: 'event',
    });
    reportSpy.mockRestore();
  });

  it('generates unique event IDs', async () => {
    await service.emit('app.load.created', 'tenant-1', {});
    await service.emit('app.load.created', 'tenant-1', {});

    const call1 = queue.add.mock.calls[0][1];
    const call2 = queue.add.mock.calls[1][1];
    expect(call1.payload.id).not.toBe(call2.payload.id);
  });

  it('sets version to 1 on payload', async () => {
    await service.emit('app.load.created', 'tenant-1', {});

    expect(queue.add).toHaveBeenCalledWith(
      'app.load.created',
      expect.objectContaining({
        payload: expect.objectContaining({ version: 1 }),
      }),
      expect.any(Object),
    );
  });

  it('includes timestamp as ISO string', async () => {
    await service.emit('app.load.created', 'tenant-1', {});

    const envelope = queue.add.mock.calls[0][1];
    expect(envelope.payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sets a deterministic jobId for dedup', async () => {
    await service.emit('app.load.created', 'tenant-1', {});

    const opts = queue.add.mock.calls[0][2];
    const envelope = queue.add.mock.calls[0][1];
    expect(opts.jobId).toBe(`app.load.created-${envelope.payload.id}`);
  });

  describe('publish (an event that already exists — the outbox, ADR "Outbox and deadlines")', () => {
    const recorded = () =>
      DomainEvent.restore({
        id: '01920000-0000-7000-8000-000000000001',
        event: 'app.widget.created',
        tenantId: '7',
        data: { widgetId: 'w-1' },
        actor: { id: 'u-1', type: 'user', label: 'Ana' },
        correlationId: 'corr-1',
        timestamp: new Date('2026-10-09T10:00:00.000Z'),
      });

    it('keeps the event id and timestamp on both paths', async () => {
      const event = recorded();
      await service.publish(event);

      expect(eventEmitter.emit).toHaveBeenCalledWith('app.widget.created', event);
      const [name, envelope, opts] = queue.add.mock.calls[0];
      expect(name).toBe('app.widget.created');
      expect(envelope.payload).toEqual(
        expect.objectContaining({
          id: event.id,
          timestamp: '2026-10-09T10:00:00.000Z',
          actor: { id: 'u-1', type: 'user', label: 'Ana' },
          correlationId: 'corr-1',
          causationId: null,
        }),
      );
      expect(opts.jobId).toBe(`app.widget.created-${event.id}`);
    });

    it('throws when the durable enqueue fails, after the hot path delivered', async () => {
      queue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.publish(recorded())).rejects.toThrow('Redis down');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('sends a null label when the actor has none', async () => {
      const event = DomainEvent.restore({ ...recorded(), actor: { id: 's', type: 'system' } });
      await service.publish(event);

      expect(queue.add.mock.calls[0][1].payload.actor).toEqual({ id: 's', type: 'system', label: null });
    });
  });
});
