import { BadRequestException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EmailVerificationService, VerificationResendCooldownException } from '../email-verification.service';
import { hashToken } from '../token-hash';
import { EMAIL_VERIFICATION_TTL_MS } from '../../constants';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { EmailService } from '../../infrastructure/notification/services/email.service';

/**
 * Email verification: the token is stored only as its hash, works for 24 hours, once, for the signed-in owner of
 * the account (D8). Every refusal is one 400 VERIFICATION_LINK_INVALID, so the route cannot test tokens.
 */
describe('EmailVerificationService', () => {
  const USER = { id: 42, email: 'Person@Example.com', firstName: 'Pat', emailVerified: false };

  function setup() {
    const tx = {
      emailVerificationToken: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { update: jest.fn() },
    };
    const prisma = {
      emailVerificationToken: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: unknown) => {
        if (typeof fn !== 'function') throw new TypeError('expected an interactive transaction callback');
        return fn(tx);
      }),
    };
    const emailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue('https://app.example.com') };
    const service = new EmailVerificationService(
      prisma as unknown as PrismaService,
      emailService as unknown as EmailService,
      config as unknown as ConfigService,
    );
    return { service, prisma, tx, emailService };
  }

  function liveRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 7,
      userId: USER.id,
      email: 'person@example.com',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: USER.id, email: 'person@example.com', deletedAt: null },
      ...overrides,
    };
  }

  afterEach(() => jest.restoreAllMocks());

  describe('issue', () => {
    it('stores only the hash of the emailed token, the lowercased email and a 24-hour expiry', async () => {
      const { service, prisma, emailService } = setup();
      const before = Date.now();

      await service.issue(USER, { reason: 'signup' });

      const data = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      const sent = emailService.sendEmail.mock.calls[0][0];
      const rawToken = /verify-email\?token=([0-9a-f]{64})/.exec(sent.text)![1];
      expect(data.tokenHash).toBe(hashToken(rawToken));
      expect(JSON.stringify(data)).not.toContain(rawToken);
      expect(data).toMatchObject({ userId: 42, email: 'person@example.com' });
      expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(before + EMAIL_VERIFICATION_TTL_MS);
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + EMAIL_VERIFICATION_TTL_MS);
      expect(sent.to).toBe('person@example.com');
      expect(sent.html).toContain(`https://app.example.com/verify-email?token=${rawToken}`);
    });

    it('escapes the first name in the HTML body: whoever signs up picks it, and the email goes to any address', async () => {
      const { service, emailService } = setup();

      await service.issue({ ...USER, firstName: '<a href="https://evil.example">Pat</a>' }, { reason: 'signup' });

      const sent = emailService.sendEmail.mock.calls[0][0];
      expect(sent.html).not.toContain('<a href="https://evil.example">');
      expect(sent.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Pat&lt;/a&gt;');
    });

    it('is a no-op for a verified user or a user with no email', async () => {
      const { service, prisma, emailService } = setup();
      await service.issue({ ...USER, emailVerified: true }, { reason: 'signup' });
      await service.issue({ ...USER, email: null }, { reason: 'signup' });
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('logs a send failure without the link and does not throw', async () => {
      const { service, emailService } = setup();
      emailService.sendEmail.mockRejectedValue(new Error('smtp down'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(service.issue(USER, { reason: 'signup' })).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain('verify-email');
      expect(logged).not.toMatch(/[0-9a-f]{64}/);
    });
  });

  describe('verify', () => {
    it('looks the token up by hash, uses it, verifies the user and uses up their other tokens', async () => {
      const { service, tx } = setup();
      tx.emailVerificationToken.findUnique.mockResolvedValue(liveRecord());

      await service.verify('raw-token', USER.id);

      expect(tx.emailVerificationToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('raw-token') } }),
      );
      expect(tx.emailVerificationToken.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 7, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: USER.id }, data: { emailVerified: true } });
      expect(tx.emailVerificationToken.updateMany).toHaveBeenNthCalledWith(2, {
        where: { userId: USER.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    const refusals: Array<[string, Record<string, unknown> | null, number]> = [
      ['an unknown token', null, USER.id],
      ['a used token', { usedAt: new Date() }, USER.id],
      ['an expired token', { expiresAt: new Date(Date.now() - 1) }, USER.id],
      ['a token for an email the account no longer has', { email: 'old@example.com' }, USER.id],
      ['a soft-deleted user', { user: { id: USER.id, email: 'person@example.com', deletedAt: new Date() } }, USER.id],
      ["another user's token (D8)", {}, 99],
    ];

    it.each(refusals)(
      'refuses %s with the one 400 VERIFICATION_LINK_INVALID and writes nothing',
      async (_c, o, caller) => {
        const { service, tx } = setup();
        tx.emailVerificationToken.findUnique.mockResolvedValue(o === null ? null : liveRecord(o));

        const err = await service.verify('raw-token', caller).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toEqual({
          code: 'VERIFICATION_LINK_INVALID',
          detail: 'This verification link is invalid or has expired.',
        });
        expect(tx.emailVerificationToken.updateMany).not.toHaveBeenCalled();
        expect(tx.user.update).not.toHaveBeenCalled();
      },
    );

    it('matches the email case-insensitively', async () => {
      const { service, tx } = setup();
      tx.emailVerificationToken.findUnique.mockResolvedValue(
        liveRecord({ user: { id: USER.id, email: 'PERSON@example.COM', deletedAt: null } }),
      );
      await expect(service.verify('raw-token', USER.id)).resolves.toBeUndefined();
    });

    it('of two concurrent verifies, only the one whose conditional update moved the row wins', async () => {
      const { service, tx } = setup();
      tx.emailVerificationToken.findUnique.mockResolvedValue(liveRecord());
      tx.emailVerificationToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      const results = await Promise.allSettled([service.verify('raw', USER.id), service.verify('raw', USER.id)]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(lost.reason).toBeInstanceOf(BadRequestException);
      expect(tx.user.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('resend', () => {
    it('is a no-op for a verified user', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue({ ...USER, emailVerified: true, deletedAt: null });
      await service.resend(USER.id);
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('answers 429 RATE_LIMITED with a retry-after when the newest token is under a minute old', async () => {
      const { service, prisma } = setup();
      prisma.user.findUnique.mockResolvedValue({ ...USER, deletedAt: null });
      prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 20_000) });

      const err = await service.resend(USER.id).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(VerificationResendCooldownException);
      expect((err as VerificationResendCooldownException).getStatus()).toBe(429);
      expect((err as VerificationResendCooldownException).getResponse()).toMatchObject({ code: 'RATE_LIMITED' });
      expect((err as VerificationResendCooldownException).retryAfterSeconds).toBeGreaterThanOrEqual(39);
      expect((err as VerificationResendCooldownException).retryAfterSeconds).toBeLessThanOrEqual(40);
      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });

    it('issues a new token once the cooldown has passed', async () => {
      const { service, prisma, emailService } = setup();
      prisma.user.findUnique.mockResolvedValue({ ...USER, deletedAt: null });
      prisma.emailVerificationToken.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 61_000) });

      await service.resend(USER.id);

      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    });
  });
});
