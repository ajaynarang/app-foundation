import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { NotificationJobsHandler } from '../notification-cleanup.processor';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NotificationTriggersService } from '../notification-triggers.service';
import { NOTIFICATIONS_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';

function makeEnvelope<P>(payload: P): JobEnvelope<P> {
  return {
    tenantId: 'system',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  };
}

function makeJob(name: string, opts?: { attemptsMade?: number; attempts?: number }): Job<JobEnvelope<unknown>> {
  return {
    id: 'j1',
    name,
    data: makeEnvelope({}),
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 1 },
  } as unknown as Job<JobEnvelope<unknown>>;
}

describe('NotificationJobsHandler', () => {
  let handler: NotificationJobsHandler;
  let prisma: any;
  let notificationTriggers: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    notificationTriggers = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationJobsHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationTriggersService, useValue: notificationTriggers },
      ],
    }).compile();

    handler = module.get(NotificationJobsHandler);
  });

  it('should delete dismissed + read notifications on CLEANUP', async () => {
    const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.CLEANUP));
    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ dismissed: 5, read: 5 });
  });

  it('should return a digest summary on DIGEST', async () => {
    const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DIGEST));
    expect(result).toEqual({ sent: 0 });
  });

  it('should no-op for unknown job names', async () => {
    const result = await handler.run(makeJob('unknown-job'));
    expect(result).toBeUndefined();
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});
