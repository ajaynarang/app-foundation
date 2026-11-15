import * as crypto from 'crypto';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JwtTokenService } from '../jwt.service';
import { FirebaseAuthService } from '../firebase-auth.service';
import { PinService } from '../pin.service';
import { TwilioVerifyService } from '../../infrastructure/sms/twilio-verify.service';
import { LoginEventService } from '../login-event.service';
import { EmailService } from '../../infrastructure/notification/services/email.service';
import { IdentityResolverService } from '../identity-resolver.service';

/**
 * `resetPassword` writes the new hash, consumes the token and revokes every session in one interactive transaction:
 * every write goes through the `tx` client the callback receives, never the root client (array transactions are
 * banned, `rls-no-array-transaction.spec.ts`).
 */
describe('AuthService.resetPassword', () => {
  const tx = {
    user: { update: jest.fn() },
    passwordResetToken: { update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };
  const prisma = {
    passwordResetToken: { findUnique: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(async (fn: unknown) => {
      if (typeof fn !== 'function') throw new TypeError('expected an interactive transaction callback');
      return fn(tx);
    }),
  };
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtTokenService, useValue: {} },
        { provide: FirebaseAuthService, useValue: {} },
        { provide: PinService, useValue: {} },
        { provide: TwilioVerifyService, useValue: {} },
        { provide: LoginEventService, useValue: {} },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
        IdentityResolverService,
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('writes the hash, consumes the token and revokes sessions on the transaction client', async () => {
    const token = 'reset-token';
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 7,
      userId: 42,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.resetPassword({ token, newPassword: 'N3w-Password!' });

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { passwordHash: expect.any(String), passwordChangedAt: expect.any(Date) },
    });
    expect(tx.passwordResetToken.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { usedAt: expect.any(Date) } });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 42, isRevoked: false },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a used token and writes nothing', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 7,
      userId: 42,
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.resetPassword({ token: 'x', newPassword: 'N3w-Password!' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
