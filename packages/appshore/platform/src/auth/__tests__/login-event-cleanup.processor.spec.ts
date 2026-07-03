import { Test, TestingModule } from '@nestjs/testing';
import { LoginEventCleanupJobHandler } from '../login-event-cleanup.processor';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';

const mockPrisma = {
  loginEvent: {
    deleteMany: jest.fn(),
  },
};

describe('LoginEventCleanupJobHandler', () => {
  let processor: LoginEventCleanupJobHandler;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginEventCleanupJobHandler,
        { provide: PrismaService, useValue: mockPrisma },
        // BullMQ worker requires the queue token to be registered
        { provide: getQueueToken(QUEUE_NAMES.BULK_OPS), useValue: {} },
      ],
    }).compile();

    processor = module.get<LoginEventCleanupJobHandler>(LoginEventCleanupJobHandler);
  });

  it('deletes events older than 90 days and returns count', async () => {
    mockPrisma.loginEvent.deleteMany.mockResolvedValue({ count: 42 });

    const result = await processor.run({
      name: BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP,
    } as any);

    expect(result).toEqual({ deleted: 42 });

    const call = mockPrisma.loginEvent.deleteMany.mock.calls[0][0];
    const cutoff: Date = call.where.createdAt.lt;

    // Cutoff should be approximately 90 days ago
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 90);
    const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
    expect(diffMs).toBeLessThan(5000); // within 5 seconds
  });

  it('returns 0 when no events are older than 90 days', async () => {
    mockPrisma.loginEvent.deleteMany.mockResolvedValue({ count: 0 });

    const result = await processor.run({
      name: BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP,
    } as any);

    expect(result).toEqual({ deleted: 0 });
  });

  it('passes a cutoff that is strictly less than 90 days from now', async () => {
    mockPrisma.loginEvent.deleteMany.mockResolvedValue({ count: 0 });

    await processor.run({
      name: BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP,
    } as any);

    const call = mockPrisma.loginEvent.deleteMany.mock.calls[0][0];
    const cutoff: Date = call.where.createdAt.lt;

    // An event from 89 days ago should NOT be deleted
    const eventAt89Days = new Date();
    eventAt89Days.setDate(eventAt89Days.getDate() - 89);
    expect(cutoff.getTime()).toBeLessThan(eventAt89Days.getTime());

    // An event from 91 days ago should be deleted (cutoff is in its past)
    const eventAt91Days = new Date();
    eventAt91Days.setDate(eventAt91Days.getDate() - 91);
    expect(cutoff.getTime()).toBeGreaterThan(eventAt91Days.getTime());
  });
});
