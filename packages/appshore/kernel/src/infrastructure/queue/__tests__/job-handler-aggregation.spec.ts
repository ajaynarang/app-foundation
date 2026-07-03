import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';

/**
 * Proves the real wiring used by DocumentsQueueModule: two SEPARATE modules each
 * export a handler CLASS, and a dispatcher module imports both and assembles them
 * into the queue's handler-array token via an explicit factory. The consumer
 * receives BOTH handlers. This is the pattern that actually works — cross-module
 * `multi: true` aggregation does NOT (it leaves the consumer with a non-array),
 * which is why assembly is explicit. Runs without Redis/Prisma.
 */

const TEST_QUEUE = 'documents';

@Injectable()
class HandlerA implements QueueJobHandler {
  readonly jobNames = ['a'];
  async run(_job: Job) {
    return 'a';
  }
}

@Injectable()
class HandlerB implements QueueJobHandler {
  readonly jobNames = ['b'];
  async run(_job: Job) {
    return 'b';
  }
}

@Module({ providers: [HandlerA], exports: [HandlerA] })
class ModuleA {}

@Module({ providers: [HandlerB], exports: [HandlerB] })
class ModuleB {}

@Injectable()
class Consumer {
  constructor(@Inject(jobHandlersToken(TEST_QUEUE)) readonly handlers: QueueJobHandler[]) {}
}

@Module({
  imports: [ModuleA, ModuleB],
  providers: [
    Consumer,
    {
      provide: jobHandlersToken(TEST_QUEUE),
      useFactory: (a: HandlerA, b: HandlerB): QueueJobHandler[] => [a, b],
      inject: [HandlerA, HandlerB],
    },
  ],
})
class ConsumerModule {}

describe('Cross-module job-handler aggregation', () => {
  it('assembles handlers from separate modules into one injected array via factory', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConsumerModule] }).compile();
    const consumer = moduleRef.get(Consumer);

    const names = consumer.handlers.flatMap((h) => h.jobNames).sort();
    expect(names).toEqual(['a', 'b']);
  });
});
