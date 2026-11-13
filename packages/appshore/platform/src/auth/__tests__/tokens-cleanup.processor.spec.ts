import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JOB_EVENTS } from '@appshore/kernel/infrastructure/queue/job-events';
import { TokensCleanupJobHandler } from '../tokens-cleanup.processor';
import type { JwtTokenService } from '../jwt.service';

describe('TokensCleanupJobHandler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('owns tokens-cleanup and deletes unusable refresh tokens through JwtTokenService', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const jwtTokens = { cleanupExpiredTokens: jest.fn().mockResolvedValue(12) };
    const handler = new TokensCleanupJobHandler(jwtTokens as unknown as JwtTokenService);

    const result = await handler.run({ name: 'tokens-cleanup' } as Job);

    expect(handler.jobNames).toEqual(['tokens-cleanup']);
    expect(jwtTokens.cleanupExpiredTokens).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ deleted: 12 });
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: JOB_EVENTS.CRON_COMPLETED, jobName: 'tokens-cleanup', deleted: 12 }),
    );
  });

  it('lets a failure reach BullMQ and writes no completion line', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const jwtTokens = { cleanupExpiredTokens: jest.fn().mockRejectedValue(new Error('db down')) };

    await expect(
      new TokensCleanupJobHandler(jwtTokens as unknown as JwtTokenService).run({ name: 'tokens-cleanup' } as Job),
    ).rejects.toThrow('db down');
    expect(logSpy).not.toHaveBeenCalledWith(expect.objectContaining({ event: JOB_EVENTS.CRON_COMPLETED }));
  });
});
