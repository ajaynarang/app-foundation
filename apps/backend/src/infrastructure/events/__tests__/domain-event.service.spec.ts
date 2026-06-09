import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventService } from '../domain-event.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';

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
});
