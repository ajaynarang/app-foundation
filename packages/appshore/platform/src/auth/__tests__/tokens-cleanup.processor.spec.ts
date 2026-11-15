import { Logger } from '@nestjs/common';
import { currentRls } from '@appshore/kernel/infrastructure/rls/rls-context';
import type { Job } from 'bullmq';
import { JOB_EVENTS } from '@appshore/kernel/infrastructure/queue/job-events';
import { EMAIL_TOKEN_RETENTION_MS, TokensCleanupJobHandler } from '../tokens-cleanup.processor';
import type { JwtTokenService } from '../jwt.service';
import type { PrismaService } from '../../infrastructure/database/prisma.service';

function prismaWith(resetCount = 0, verificationCount = 0) {
  return {
    passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: resetCount }) },
    emailVerificationToken: { deleteMany: jest.fn().mockResolvedValue({ count: verificationCount }) },
  };
}
const asPrisma = (p: ReturnType<typeof prismaWith>) => p as unknown as PrismaService;

describe('TokensCleanupJobHandler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('owns tokens-cleanup and deletes unusable refresh tokens through JwtTokenService', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const jwtTokens = { cleanupExpiredTokens: jest.fn().mockResolvedValue(12) };
    const handler = new TokensCleanupJobHandler(jwtTokens as unknown as JwtTokenService, asPrisma(prismaWith()));

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
      new TokensCleanupJobHandler(jwtTokens as unknown as JwtTokenService, asPrisma(prismaWith())).run({
        name: 'tokens-cleanup',
      } as Job),
    ).rejects.toThrow('db down');
    expect(logSpy).not.toHaveBeenCalledWith(expect.objectContaining({ event: JOB_EVENTS.CRON_COMPLETED }));
  });

  it('runs the sweep as declared cross-tenant work (sweep.tokens-cleanup)', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    let seen: unknown;
    const jwtTokens = {
      cleanupExpiredTokens: jest.fn(async () => {
        seen = currentRls();
        return 0;
      }),
    };
    await new TokensCleanupJobHandler(jwtTokens as unknown as JwtTokenService, asPrisma(prismaWith())).run({
      name: 'tokens-cleanup',
    } as Job);
    expect(seen).toEqual({ kind: 'system', reason: 'sweep.tokens-cleanup' });
  });

  it('also deletes reset and verification tokens that expired or were used more than 7 days ago', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const jwtTokens = { cleanupExpiredTokens: jest.fn().mockResolvedValue(3) };
    const prisma = prismaWith(2, 5);
    const before = Date.now();

    const result = await new TokensCleanupJobHandler(jwtTokens as unknown as JwtTokenService, asPrisma(prisma)).run({
      name: 'tokens-cleanup',
    } as Job);

    expect(result).toEqual({ deleted: 10 });
    for (const deleteMany of [prisma.passwordResetToken.deleteMany, prisma.emailVerificationToken.deleteMany]) {
      expect(deleteMany).toHaveBeenCalledTimes(1);
      const where = deleteMany.mock.calls[0][0].where;
      const cutoff: Date = where.OR[0].expiresAt.lt;
      expect(where).toEqual({ OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] });
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - EMAIL_TOKEN_RETENTION_MS);
      expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - EMAIL_TOKEN_RETENTION_MS);
    }
  });
});
