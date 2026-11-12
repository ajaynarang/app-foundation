import { BullModule } from '@nestjs/bullmq';
// Not re-exported from the package index; it is the class that actually builds the workers.
import { BullExplorer } from '@nestjs/bullmq/dist/bull.explorer';
import { Worker } from 'bullmq';
import {
  NonConsumingWorker,
  QUEUE_PROCESSORS_ENABLED_ENV,
  applyQueueProcessingMode,
  isQueueProcessingEnabled,
} from '../queue-processing-mode';

// A real BullMQ Worker opens a Redis connection in its constructor. Replace it
// with a recorder so the test asserts the options the worker is built with.
jest.mock('bullmq', () => {
  class RecordingWorker {
    constructor(
      public readonly name: string,
      public readonly processor: unknown,
      public readonly opts: Record<string, unknown> = {},
    ) {}
  }
  return { ...jest.requireActual('bullmq'), Worker: RecordingWorker };
});

function explorerWorkerClass(): unknown {
  return (BullExplorer as unknown as { _workerClass: unknown })._workerClass;
}

describe('isQueueProcessingEnabled', () => {
  it('defaults to enabled when the switch is unset (shipped behaviour)', () => {
    expect(isQueueProcessingEnabled({})).toBe(true);
  });

  it.each(['true', 'TRUE', '1', 'yes', ''])('stays enabled for %p', (value) => {
    expect(isQueueProcessingEnabled({ [QUEUE_PROCESSORS_ENABLED_ENV]: value })).toBe(true);
  });

  it.each(['false', 'FALSE', ' false '])('is disabled for %p', (value) => {
    expect(isQueueProcessingEnabled({ [QUEUE_PROCESSORS_ENABLED_ENV]: value })).toBe(false);
  });
});

describe('NonConsumingWorker', () => {
  it('forces autorun off so the worker never pulls jobs, even if a processor asked for autorun', () => {
    const worker = new NonConsumingWorker('events', jest.fn(), { autorun: true, concurrency: 10 } as never);
    const opts = (worker as unknown as { opts: Record<string, unknown> }).opts;

    expect(opts.autorun).toBe(false);
    expect(opts.concurrency).toBe(10);
  });

  it('is still a BullMQ Worker so WorkerHost event wiring and shutdown keep working', () => {
    expect(new NonConsumingWorker('events', jest.fn())).toBeInstanceOf(Worker);
  });
});

describe('applyQueueProcessingMode', () => {
  afterEach(() => {
    BullModule.workerClass = Worker;
  });

  it('leaves the default BullMQ worker in place when processing is enabled', () => {
    const enabled = applyQueueProcessingMode({});

    expect(enabled).toBe(true);
    expect(explorerWorkerClass()).toBe(Worker);
  });

  it('makes @nestjs/bullmq build non-consuming workers when processing is disabled', () => {
    const enabled = applyQueueProcessingMode({ [QUEUE_PROCESSORS_ENABLED_ENV]: 'false' });

    expect(enabled).toBe(false);
    expect(explorerWorkerClass()).toBe(NonConsumingWorker);
  });
});
