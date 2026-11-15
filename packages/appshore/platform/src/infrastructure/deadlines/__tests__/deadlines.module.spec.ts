import { Global, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Deadline } from '@appshore/db';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { PrismaService } from '../../database/prisma.service';
import { DeadlineHandlerRegistry } from '../deadline-handler.registry';
import { DeadlineSweeper } from '../deadline.sweeper';
import { DEADLINE_HANDLERS, type DeadlineHandler, type DeadlineOutcome } from '../deadline.types';
import { DeadlinesModule } from '../deadlines.module';

/** A throwaway kind, registered the way an app module would — it exists only in this spec. */
@Injectable()
class TestKindHandler implements DeadlineHandler, OnModuleInit {
  readonly kind = 'TEST_KIND';
  readonly fired: string[] = [];

  constructor(@Inject(DEADLINE_HANDLERS) private readonly handlers: DeadlineHandlerRegistry) {}

  onModuleInit() {
    this.handlers.register(this);
  }

  async fire(deadline: Deadline): Promise<DeadlineOutcome> {
    this.fired.push(deadline.id);
    return { outcome: 'fired' };
  }
}

@Module({ imports: [DeadlinesModule], providers: [TestKindHandler], exports: [TestKindHandler] })
class TestFeatureModule {}

describe('DeadlinesModule', () => {
  it('lets an app module register a kind that the shared sweeper then fires', async () => {
    const prisma = createMockPrisma();
    prisma.jobSchedule.findUnique.mockResolvedValue({ isEnabled: false, intervalMs: null });
    prisma.deadline.updateMany.mockResolvedValue({ count: 1 });
    const queue = {
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      add: jest.fn(),
      removeRepeatableByKey: jest.fn(),
    };

    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(QUEUE_NAMES.BULK_OPS), useValue: queue },
      ],
      exports: [PrismaService, getQueueToken(QUEUE_NAMES.BULK_OPS)],
    })
    class InfraStubModule {}

    const moduleRef = await Test.createTestingModule({ imports: [InfraStubModule, DeadlinesModule, TestFeatureModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    await moduleRef.init();

    expect(moduleRef.get(DeadlineHandlerRegistry).kinds()).toEqual(['TEST_KIND']);
    expect(moduleRef.get(DEADLINE_HANDLERS)).toBe(moduleRef.get(DeadlineHandlerRegistry));

    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'dl-test', kind: 'TEST_KIND', attempts: 1 }]);
    const summary = await moduleRef.get(DeadlineSweeper).sweep();

    expect(summary.fired).toBe(1);
    expect(moduleRef.get(TestKindHandler).fired).toEqual(['dl-test']);
    await moduleRef.close();
  });
});
