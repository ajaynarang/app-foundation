import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { DeadLetterService } from '../dead-letter.service';
import { PrismaService } from '../../database/prisma.service';
import { TenantIdResolver } from '../../events/tenant-id-resolver.service';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let mockPrisma: {
    deadLetterLog: { create: jest.Mock };
  };
  let mockTenantResolver: { resolveToDbId: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = {
      deadLetterLog: { create: jest.fn().mockResolvedValue({ id: 'dl-1' }) },
    };
    mockTenantResolver = {
      resolveToDbId: jest.fn().mockResolvedValue(42),
    };

    const module = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantIdResolver, useValue: mockTenantResolver },
      ],
    }).compile();

    service = module.get(DeadLetterService);
  });

  function makeJob(
    overrides: Partial<{ data: unknown; name: string; queueName: string; id: string; attemptsMade: number }> = {},
  ): Job {
    const envelope: JobEnvelope<{ loadId: string }> = {
      tenantId: 'demo-northstar-2026',
      correlationId: 'corr-1',
      causationId: 'cause-1',
      userId: 'user-1',
      payload: { loadId: 'LD-001' },
      metadata: {
        enqueuedAt: '2026-05-27T12:00:00.000Z',
        source: 'api',
        version: 1,
      },
    };
    return {
      id: 'bull-job-99',
      name: 'sync-fleet',
      queueName: 'fleet-pipeline',
      attemptsMade: 3,
      data: envelope,
      ...overrides,
    } as unknown as Job;
  }

  it('persists failed job with envelope + error', async () => {
    const job = makeJob();
    const err = new Error('vendor timeout');
    err.stack = 'Error: vendor timeout\n    at processor.ts:42';

    await service.recordPermanentFailure(job, err);

    expect(mockTenantResolver.resolveToDbId).toHaveBeenCalledWith('demo-northstar-2026');
    expect(mockPrisma.deadLetterLog.create).toHaveBeenCalledTimes(1);

    const createArg = mockPrisma.deadLetterLog.create.mock.calls[0][0];
    expect(createArg.data.id).toMatch(UUID_V7_REGEX);
    expect(createArg.data).toMatchObject({
      tenantId: 42,
      queueName: 'fleet-pipeline',
      jobName: 'sync-fleet',
      bullJobId: 'bull-job-99',
      correlationId: 'corr-1',
      causationId: 'cause-1',
      errorMessage: 'vendor timeout',
      errorStack: 'Error: vendor timeout\n    at processor.ts:42',
      attempts: 3,
    });
    // payload must be the full envelope so an operator can replay it as-is
    expect(createArg.data.payload).toEqual(job.data);
  });

  it('skips when envelope is missing tenantId', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const job = makeJob({ data: {} });

    await service.recordPermanentFailure(job, new Error('boom'));

    expect(mockPrisma.deadLetterLog.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips when tenantId slug cannot be resolved to a DB id', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockTenantResolver.resolveToDbId.mockResolvedValueOnce(null);

    await service.recordPermanentFailure(makeJob(), new Error('boom'));

    expect(mockPrisma.deadLetterLog.create).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('swallows prisma persist errors without throwing', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mockPrisma.deadLetterLog.create.mockRejectedValueOnce(new Error('db down'));

    await expect(service.recordPermanentFailure(makeJob(), new Error('original failure'))).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
